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

const dbName = `knowledge_source_processed_${randomUUID().replace(/-/g, "_")}`;
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

const { setKnowledgeSourceProcessed } = await import("./knowledge-source-processed.repo.js");
const { listPendingKnowledgeBitsForReview } = await import("../knowledge-bit/knowledge-bit-approval.repo.js");
const { listFullyReviewedAndProcessedEntries } = await import("../knowledge-bit/knowledge-bit-approval-entries.repo.js");
const { countPendingKnowledgeBits } = await import("../knowledge-bit/knowledge-bit-bulk-approval.repo.js");

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

async function seedSource(status: string, subjectId: string | null = null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, updated_at)
     VALUES ($1, 'prose', 'Entry text', $2, $3, now() - interval '1 hour')`,
    [id, status, subjectId],
  );

  return id;
}

let nextOrdinal = 0;

async function seedBit(sourceId: string, origin: "extracted" | "manual"): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin)
     VALUES ($1, $2, $3, 'Body', 'pending', $4)`,
    [id, sourceId, nextOrdinal++, origin],
  );

  return id;
}

async function seedDecidedBit(sourceId: string, state: "approved" | "rejected"): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, $2, $3, 'Body', $4)`,
    [`kb_${randomUUID()}`, sourceId, nextOrdinal++, state],
  );
}

async function readSource(id: string) {
  const { rows } = await client.query(
    `SELECT status, raw_text, subject_id, processed_at, updated_at FROM knowledge_sources WHERE id = $1`,
    [id],
  );

  return rows[0];
}

describe("entry processed mark (real Postgres)", () => {
  it("should stamp processed time without touching status or text", async () => {
    const id = await seedSource("bits_detected", "sub_1");
    const before = await readSource(id);

    const result = await setKnowledgeSourceProcessed(id, true);
    const after = await readSource(id);

    expect(result).toMatchObject({ ok: true, id });
    expect(after.processed_at).toBeInstanceOf(Date);
    expect(after).toMatchObject({ status: "bits_detected", raw_text: "Entry text", subject_id: "sub_1" });
    expect(after.updated_at).toEqual(before.updated_at);
  });

  it("should keep the first processed time when marked again", async () => {
    const id = await seedSource("bits_detected");

    const first = await setKnowledgeSourceProcessed(id, true);
    const second = await setKnowledgeSourceProcessed(id, true);

    expect(first.ok && second.ok && second.processedAt).toEqual(first.ok && first.processedAt);
    expect(first.ok && first.processedAt).not.toBeNull();
  });

  it("should clear processed time on reopen", async () => {
    const id = await seedSource("bits_detected");

    await setKnowledgeSourceProcessed(id, true);
    const result = await setKnowledgeSourceProcessed(id, false);

    expect(result).toEqual({ ok: true, id, processedAt: null });
    expect(await readSource(id)).toMatchObject({ processed_at: null, status: "bits_detected" });
  });

  it("should accept reopening an open entry", async () => {
    const id = await seedSource("pending");

    expect(await setKnowledgeSourceProcessed(id, false)).toEqual({ ok: true, id, processedAt: null });
  });

  it("should report not found for a missing entry", async () => {
    expect(await setKnowledgeSourceProcessed("ksrc_missing", true)).toEqual({ ok: false, reason: "not_found" });
    expect(await setKnowledgeSourceProcessed("ksrc_missing", false)).toEqual({ ok: false, reason: "not_found" });
  });

  it("should refuse while the entry is processing", async () => {
    const id = await seedSource("processing");

    expect(await setKnowledgeSourceProcessed(id, true)).toEqual({ ok: false, reason: "entry_processing" });
    expect(await setKnowledgeSourceProcessed(id, false)).toEqual({ ok: false, reason: "entry_processing" });
    expect((await readSource(id)).processed_at).toBeNull();
  });

  it("should refuse to mark an entry that still has a pending card", async () => {
    const id = await seedSource("bits_detected");

    await seedDecidedBit(id, "approved");
    await seedBit(id, "manual");

    expect(await setKnowledgeSourceProcessed(id, true)).toEqual({ ok: false, reason: "pending_items" });
    expect((await readSource(id)).processed_at).toBeNull();
  });

  it("should mark an entry whose cards are all decided", async () => {
    const id = await seedSource("bits_detected");

    await seedDecidedBit(id, "approved");
    await seedDecidedBit(id, "rejected");

    expect(await setKnowledgeSourceProcessed(id, true)).toMatchObject({ ok: true });
  });

  it("should reopen an entry that has pending cards", async () => {
    const id = await seedSource("bits_detected");

    await seedBit(id, "extracted");
    await client.query(`UPDATE knowledge_sources SET processed_at = now() WHERE id = $1`, [id]);

    expect(await setKnowledgeSourceProcessed(id, false)).toEqual({ ok: true, id, processedAt: null });
  });

  it("should report the real totals of fully reviewed and processed entries", async () => {
    for (let index = 0; index < 3; index++) {
      const id = await seedSource("bits_detected");

      await seedDecidedBit(id, "approved");

      if (index === 0) {
        await client.query(`UPDATE knowledge_sources SET processed_at = now() WHERE id = $1`, [id]);
      }
    }

    const list = await listFullyReviewedAndProcessedEntries();
    const reviewedTotals = new Set(list.filter((entry) => !entry.processedAt).map((entry) => entry.groupTotal));
    const processedTotals = new Set(list.filter((entry) => entry.processedAt).map((entry) => entry.groupTotal));

    expect(reviewedTotals).toEqual(new Set([list.filter((entry) => !entry.processedAt).length]));
    expect(processedTotals).toEqual(new Set([list.filter((entry) => entry.processedAt).length]));
    expect(list.every((entry) => typeof entry.groupTotal === "number")).toBe(true);
  });

  it.each(["pending", "failed", "bits_detected"])("should mark an entry that is %s", async (status) => {
    const id = await seedSource(status);

    expect(await setKnowledgeSourceProcessed(id, true)).toMatchObject({ ok: true });
  });

  it("should carry processed time and item origin in the pending review list", async () => {
    const openId = await seedSource("bits_detected");
    const processedId = await seedSource("bits_detected");

    await seedBit(openId, "extracted");
    await seedBit(processedId, "manual");
    await client.query(`UPDATE knowledge_sources SET processed_at = now() WHERE id = $1`, [processedId]);

    const list = await listPendingKnowledgeBitsForReview(100);
    const open = list.find((source) => source.knowledgeSourceId === openId);
    const processed = list.find((source) => source.knowledgeSourceId === processedId);

    expect(open?.processedAt).toBeNull();
    expect(open?.bits[0]?.origin).toBe("extracted");
    expect(processed?.processedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(processed?.bits).toEqual([]);
  });

  it("should drop the pending count while an entry is processed and restore it on reopen", async () => {
    const id = await seedSource("bits_detected");

    await seedBit(id, "extracted");
    await seedBit(id, "manual");

    const before = await countPendingKnowledgeBits();

    await client.query(`UPDATE knowledge_sources SET processed_at = now() WHERE id = $1`, [id]);
    const marked = await countPendingKnowledgeBits();

    await setKnowledgeSourceProcessed(id, false);
    const reopened = await countPendingKnowledgeBits();

    expect([marked, reopened]).toEqual([before - 2, before]);
    expect(before).toBeGreaterThanOrEqual(2);
  });

  it("should list fully reviewed entries newest first", async () => {
    const ids: string[] = [];

    for (const ageHours of [3, 1, 2]) {
      const id = `ksrc_${randomUUID()}`;

      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, created_at, updated_at)
         VALUES ($1, 'prose', 'Reviewed', 'bits_detected', now() - make_interval(hours => $2), now())`,
        [id, ageHours],
      );
      await client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
         VALUES ($1, $2, 0, 'Body', 'approved')`,
        [`kb_${randomUUID()}`, id],
      );
      ids.push(id);
    }

    const list = await listFullyReviewedAndProcessedEntries();
    const order = list.map((entry) => entry.knowledgeSourceId).filter((id) => ids.includes(id));

    expect(order).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("should send only a truncated text preview for fully reviewed and processed entries", async () => {
    const reviewedId = `ksrc_${randomUUID()}`;
    const processedId = `ksrc_${randomUUID()}`;
    const longText = "x".repeat(5000);

    for (const id of [reviewedId, processedId]) {
      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at)
         VALUES ($1, 'prose', $2, 'bits_detected', now())`,
        [id, longText],
      );
      await client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
         VALUES ($1, $2, 0, 'Body', 'approved')`,
        [`kb_${randomUUID()}`, id],
      );
    }

    await setKnowledgeSourceProcessed(processedId, true);

    const list = await listFullyReviewedAndProcessedEntries();

    for (const id of [reviewedId, processedId]) {
      expect(list.find((entry) => entry.knowledgeSourceId === id)?.sourceText).toBe("x".repeat(2000));
    }
  });
});
