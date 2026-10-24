import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `knowledge_bit_manual_item_${randomUUID().replace(/-/g, "_")}`;
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

const { insertManualKnowledgeItem } = await import("./knowledge-bit-manual-item.repo.js");
const { listKnowledgeBitsForWhQuestionGenerationScan } = await import(
  "./knowledge-bit-wh-question-claim.repo.js"
);
const { listKnowledgeBitsForFillBlankGenerationScan } = await import(
  "./knowledge-bit-fill-blank-claim.repo.js"
);
const { listKnowledgeBitsForBasicCardGenerationScan } = await import(
  "./knowledge-bit-basic-card-claim.repo.js"
);
const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-approval.repo.js");

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

async function seedEntry(
  status: "bits_detected" | "processing" = "bits_detected",
  processed = false,
): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at, processed_at)
     VALUES ($1, 'prose', $2, $3, now(), CASE WHEN $4::boolean THEN now() ELSE NULL END)`,
    [id, "Source text for manual items.", status, processed],
  );

  return id;
}

async function seedBit(
  entryId: string,
  ordinal: number,
  approvalState: "pending" | "superseded" = "pending",
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, $5)`,
    [id, entryId, ordinal, `seed ${ordinal}`, approvalState],
  );

  return id;
}

async function bitRow(bitId: string) {
  const result = await client.query(
    `SELECT id, ordinal, body, background, approval_state, origin, wh_question_generated_at,
            fill_blank_generated_at, basic_card_generated_at
       FROM knowledge_bits WHERE id = $1`,
    [bitId],
  );

  return result.rows[0];
}

async function bitsOf(entryId: string) {
  const result = await client.query(
    `SELECT id, ordinal FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal`,
    [entryId],
  );

  return result.rows;
}

describe("insertManualKnowledgeItem (real Postgres)", () => {
  it("should store one pending manual bit with stamped generation columns and one basic variant", async () => {
    const entryId = await seedEntry();

    const result = await insertManualKnowledgeItem(entryId, {
      front: "What is a closure?",
      back: "A function with its captured scope.",
      example: "const f = () => x;",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const row = await bitRow(result.item.id);

    expect(row).toMatchObject({
      ordinal: 0,
      body: "What is a closure?\nA function with its captured scope.",
      background: "const f = () => x;",
      approval_state: "pending",
      origin: "manual",
    });
    expect(row.wh_question_generated_at).not.toBeNull();
    expect(row.fill_blank_generated_at).not.toBeNull();
    expect(row.basic_card_generated_at).not.toBeNull();

    const variants = await client.query(
      `SELECT kind, "order", prompt, answer FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [result.item.id],
    );

    expect(variants.rows).toEqual([
      { kind: "basic", order: 0, prompt: "What is a closure?", answer: "A function with its captured scope." },
    ]);
    expect(result.item.variants).toEqual([
      expect.objectContaining({ kind: "basic", prompt: "What is a closure?", answer: "A function with its captured scope." }),
    ]);
    expect(result.item.origin).toBe("manual");
    expect(result.item).toMatchObject({ feedback: null });
    expect(result.item.background).toBe("const f = () => x;");
  });

  it("should return a null background and feedback when no example is given", async () => {
    const entryId = await seedEntry();
    const result = await insertManualKnowledgeItem(entryId, { front: "Q", back: "A", example: undefined });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.item.origin).toBe("manual");
    expect(result.item.background).toBeNull();
    expect(result.item.feedback).toBeNull();
    expect((await bitRow(result.item.id)).background).toBeNull();
  });

  it("should appear in the pending-review list as a manual item", async () => {
    const entryId = await seedEntry();
    const result = await insertManualKnowledgeItem(entryId, { front: "Q review", back: "A review" });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const sources = await listPendingKnowledgeBitsForReview(500);
    const entry = sources.find((source) => source.knowledgeSourceId === entryId);

    expect(entry?.bits.map((bit) => bit.id)).toContain(result.item.id);
  });

  it("should number the new item after the last ordinal, counting superseded bits", async () => {
    const entryId = await seedEntry();

    await seedBit(entryId, 0);
    await seedBit(entryId, 1);
    await seedBit(entryId, 4, "superseded");

    const result = await insertManualKnowledgeItem(entryId, { front: "Q", back: "A" });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect((await bitRow(result.item.id)).ordinal).toBe(5);
  });

  it("should give two simultaneous creates on one entry distinct ordinals", async () => {
    const entryId = await seedEntry();

    const results = await Promise.all([
      insertManualKnowledgeItem(entryId, { front: "Q one", back: "A one" }),
      insertManualKnowledgeItem(entryId, { front: "Q two", back: "A two" }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect((await bitsOf(entryId)).map((row) => row.ordinal)).toEqual([0, 1]);
  });

  it("should refuse a create while the entry is processing and write no rows", async () => {
    const entryId = await seedEntry("processing");

    const result = await insertManualKnowledgeItem(entryId, { front: "Q", back: "A" });

    expect(result).toEqual({ ok: false, error: "already_running" });
    expect(await bitsOf(entryId)).toEqual([]);
  });

  it("should refuse a create on a processed entry and write no rows", async () => {
    const entryId = await seedEntry("bits_detected", true);

    const result = await insertManualKnowledgeItem(entryId, { front: "Q", back: "A" });

    expect(result).toEqual({ ok: false, error: "entry_processed" });
    expect(await bitsOf(entryId)).toEqual([]);
  });

  it("should return not_found for an entry that does not exist", async () => {
    const result = await insertManualKnowledgeItem(`ksrc_missing_${randomUUID()}`, { front: "Q", back: "A" });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("should write no feedback rows for the new item", async () => {
    const entryId = await seedEntry();

    await insertManualKnowledgeItem(entryId, { front: "Q", back: "A" });

    const feedback = await client.query(
      `SELECT count(*)::int AS count FROM knowledge_bit_feedback WHERE knowledge_source_id = $1`,
      [entryId],
    );

    expect(feedback.rows[0].count).toBe(0);
  });

  it("should keep the new item out of all three generation scans while an unstamped control bit is picked up", async () => {
    const entryId = await seedEntry();
    const controlId = await seedBit(entryId, 0);
    const result = await insertManualKnowledgeItem(entryId, { front: "Q scan", back: "A scan" });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const scans = await Promise.all([
      listKnowledgeBitsForWhQuestionGenerationScan(500),
      listKnowledgeBitsForFillBlankGenerationScan(500),
      listKnowledgeBitsForBasicCardGenerationScan(500),
    ]);

    for (const scan of scans) {
      const ids = scan.map((bit) => bit.id);

      expect(ids).toContain(controlId);
      expect(ids).not.toContain(result.item.id);
    }
  });
});
