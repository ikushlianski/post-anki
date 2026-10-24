import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb, getDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.KNOWLEDGE_CLEANUP_TEST_BASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_race_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

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

const { deleteKnowledgeSource, clearAllKnowledge } = await import("./knowledge-cleanup.repo.js");
const { insertSourceItemsForChunk } = await import("./knowledge-bit-source-items.repo.js");
const { recordGeneratedQuestionVariant } = await import("./knowledge-bit-wh-question-claim.repo.js");
const { recordKnowledgeBitFeedback } = await import("./knowledge-bit-feedback.repo.js");

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

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    statement: `Statement ${i}`,
    quote: `quote ${i}`,
    example: null,
    cards: [
      {
        kind: "basic" as const,
        statement: `Statement ${i}`,
        question: `Question ${i}`,
        answer: `Answer ${i}`,
        quote: `quote ${i}`,
      },
    ],
  }));

async function seedProcessingSource(): Promise<{ sourceId: string; claimedAt: Date }> {
  const sourceId = `ksrc_${randomUUID()}`;
  const { rows } = await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at)
     VALUES ($1, 'prose', 't', 'processing', date_trunc('milliseconds', now()))
     RETURNING updated_at`,
    [sourceId],
  );

  return { sourceId, claimedAt: rows[0].updated_at as Date };
}

async function count(table: string, where = "true", params: unknown[] = []): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params);

  return rows[0].n as number;
}

describe("deleting a source while extraction is running", () => {
  it("should insert nothing when extraction finishes after the source was deleted", async () => {
    const { sourceId, claimedAt } = await seedProcessingSource();

    await deleteKnowledgeSource(sourceId);

    const inserted = await insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(3) });

    expect(inserted).toBe(0);
    expect(await count("knowledge_bits", "knowledge_source_id = $1", [sourceId])).toBe(0);
  });

  it("should leave no pieces behind when the delete and an extraction write race", async () => {
    for (let round = 0; round < 10; round++) {
      const { sourceId, claimedAt } = await seedProcessingSource();

      await Promise.allSettled([
        deleteKnowledgeSource(sourceId),
        insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(5) }),
      ]);

      expect(await count("knowledge_sources", "id = $1", [sourceId])).toBe(0);
      expect(await count("knowledge_bits", "knowledge_source_id = $1", [sourceId])).toBe(0);
      expect(
        await count(
          "knowledge_bit_question_variants",
          "knowledge_bit_id NOT IN (SELECT id FROM knowledge_bits)",
        ),
      ).toBe(0);
    }
  });

  it("should add no variant for a piece that was deleted while its variant was generated", async () => {
    const { sourceId, claimedAt } = await seedProcessingSource();

    await insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(1) });

    const { rows } = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);
    const bitId = rows[0].id as string;

    await deleteKnowledgeSource(sourceId);
    await recordGeneratedQuestionVariant(bitId, "wh_question", 1, "P", "A", "token");

    expect(await count("knowledge_bit_question_variants", "knowledge_bit_id = $1", [bitId])).toBe(0);
  });

  it("should write no feedback for a piece whose source was deleted", async () => {
    const { sourceId, claimedAt } = await seedProcessingSource();

    await insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(1) });

    const { rows } = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);
    const bitId = rows[0].id as string;

    await deleteKnowledgeSource(sourceId);

    const feedbackId = await recordKnowledgeBitFeedback(getDb(), { bitId, verdict: "approved" });

    expect(feedbackId).toBeNull();
    expect(await count("knowledge_bit_feedback", "knowledge_source_id = $1", [sourceId])).toBe(0);
  });
});

describe("clearing all knowledge while extraction is running", () => {
  it("should insert nothing for any source when extraction finishes after clear-all", async () => {
    const first = await seedProcessingSource();
    const second = await seedProcessingSource();

    await clearAllKnowledge();

    for (const { sourceId, claimedAt } of [first, second]) {
      expect(await insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(2) })).toBe(0);
    }

    expect(await count("knowledge_bits")).toBe(0);
    expect(await count("knowledge_bit_question_variants")).toBe(0);
  });

  it("should leave nothing behind when clear-all and an extraction write race", async () => {
    for (let round = 0; round < 10; round++) {
      const { sourceId, claimedAt } = await seedProcessingSource();

      await Promise.allSettled([
        clearAllKnowledge(),
        insertSourceItemsForChunk({ sourceId, claimedAt, firstOrdinal: 0, items: items(5) }),
      ]);

      expect(await count("knowledge_sources")).toBe(0);
      expect(await count("knowledge_bits")).toBe(0);
      expect(await count("knowledge_bit_question_variants")).toBe(0);
    }
  });
});
