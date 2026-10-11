import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `knowledge_bit_feedback_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { approveKnowledgeBit, rejectKnowledgeBit } = await import("./knowledge-bit-approval.repo.js");
const { approveKnowledgeBitsBulk } = await import("./knowledge-bit-bulk-approval.repo.js");
const {
  aggregateFeedbackByModel,
  loadRecentFeedbackForExtraction,
  restoreRejectedKnowledgeBit,
  setKnowledgeBitFeedbackReason,
} = await import("./knowledge-bit-feedback.repo.js");
const { DEFAULT_KNOWLEDGE_ITEM_MODEL_ID } = await import("@post-anki/shared");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function seedSource(subjectId: string | null, modelId: string | null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, extraction_model_id)
     VALUES ($1, 'prose', 'text', 'bits_detected', $2, $3)`,
    [id, subjectId, modelId],
  );

  return id;
}

let nextOrdinal = 0;

async function seedBit(sourceId: string, body: string, front: string, back: string): Promise<string> {
  const id = `kb_${randomUUID()}`;
  const ordinal = nextOrdinal++;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $4, $3, 'pending')`,
    [id, sourceId, body, ordinal],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'basic', 0, $3, $4)`,
    [`kbqv_${randomUUID()}`, id, front, back],
  );

  return id;
}

async function feedbackFor(bitId: string) {
  const { rows } = await client.query(
    `SELECT * FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1 ORDER BY created_at`,
    [bitId],
  );

  return rows;
}

describe("review feedback (real Postgres)", () => {
  it("should record a rejection with the card text, the subject and the model of the source", async () => {
    const sourceId = await seedSource("sub_sales", "openrouter/openai/gpt-6-luna");
    const bitId = await seedBit(sourceId, "A statement", "A front?", "A back.");

    const result = await rejectKnowledgeBit(bitId);

    expect(result).toMatchObject({ ok: true });

    const rows = await feedbackFor(bitId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      verdict: "rejected",
      reason_code: "unspecified",
      subject_id: "sub_sales",
      model_id: "openrouter/openai/gpt-6-luna",
      statement: "A statement",
      front: "A front?",
      back: "A back.",
    });
  });

  it("should fall back to the admin default model when the source has none", async () => {
    const sourceId = await seedSource(null, null);
    const bitId = await seedBit(sourceId, "S", "F?", "B.");

    await rejectKnowledgeBit(bitId);

    expect((await feedbackFor(bitId))[0]!.model_id).toBe(DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
  });

  it("should not duplicate the rejection when the same reject is retried", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "F?", "B.");

    const first = await rejectKnowledgeBit(bitId);
    const second = await rejectKnowledgeBit(bitId);

    expect(await feedbackFor(bitId)).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("should record an approval once, keeping the card text as a positive example", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "Good front?", "Good back.");

    await approveKnowledgeBit(bitId);
    await approveKnowledgeBit(bitId);

    const rows = await feedbackFor(bitId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verdict: "approved", reason_code: null, front: "Good front?" });
  });

  it("should record approvals made in bulk", async () => {
    const sourceId = await seedSource(null, "m/bulk");
    const a = await seedBit(sourceId, "A", "FA?", "BA.");
    const b = await seedBit(sourceId, "B", "FB?", "BB.");

    await approveKnowledgeBitsBulk([a, b]);

    expect(await feedbackFor(a)).toHaveLength(1);
    expect(await feedbackFor(b)).toHaveLength(1);
  });

  it("should store the reason and the note on the rejection afterwards", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "F?", "B.");
    const result = await rejectKnowledgeBit(bitId);

    if (!result.ok || !result.feedbackId) {
      throw new Error("expected a feedback id");
    }

    const updated = await setKnowledgeBitFeedbackReason(result.feedbackId, {
      reasonCode: "meta_wording",
      note: "says according to the text",
    });

    expect(updated).toBe(true);
    expect((await feedbackFor(bitId))[0]).toMatchObject({
      reason_code: "meta_wording",
      note: "says according to the text",
    });
  });

  it("should refuse to set a reason on an approval record", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "F?", "B.");

    await approveKnowledgeBit(bitId);

    const approvalId = (await feedbackFor(bitId))[0]!.id as string;

    expect(await setKnowledgeBitFeedbackReason(approvalId, { reasonCode: "other" })).toBe(false);
  });

  it("should bring a rejected suggestion back to pending and forget the rejection", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "F?", "B.");

    await rejectKnowledgeBit(bitId);

    expect(await restoreRejectedKnowledgeBit(bitId)).toBe(true);

    const { rows } = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [bitId]);

    expect(rows[0]!.approval_state).toBe("pending");
    expect(await feedbackFor(bitId)).toHaveLength(0);
  });

  it("should not restore a suggestion that was approved", async () => {
    const sourceId = await seedSource(null, "m/x");
    const bitId = await seedBit(sourceId, "S", "F?", "B.");

    await approveKnowledgeBit(bitId);

    expect(await restoreRejectedKnowledgeBit(bitId)).toBe(false);
  });

  it("should load the feedback of the subject, and use everything when the subject has none", async () => {
    const sourceId = await seedSource("sub_only_here", "m/subject");
    const bitId = await seedBit(sourceId, "S", "Subject front?", "B.");

    await rejectKnowledgeBit(bitId);

    const scoped = await loadRecentFeedbackForExtraction("sub_only_here");
    const fallback = await loadRecentFeedbackForExtraction("sub_with_nothing");

    expect(scoped.recent.every((row) => row.front === "Subject front?")).toBe(true);
    expect(fallback.recent.length).toBeGreaterThan(1);
  });

  it("should compare approved and rejected suggestions per model", async () => {
    const sourceId = await seedSource(null, "m/compare");
    const good = await seedBit(sourceId, "G", "G?", "g.");
    const bad = await seedBit(sourceId, "B", "B?", "b.");

    await approveKnowledgeBit(good);
    await rejectKnowledgeBit(bad);

    const stats = await aggregateFeedbackByModel();
    const entry = stats.models.find((m) => m.modelId === "m/compare");

    expect(entry).toMatchObject({ approved: 1, rejected: 1 });
    expect(entry!.topReasons).toEqual([{ reasonCode: "unspecified", count: 1 }]);
  });
});
