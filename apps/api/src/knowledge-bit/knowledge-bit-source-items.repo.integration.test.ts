import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT, itemsForChunk } from "./knowledge-bit-source-items.test-mocks.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

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

const dbName = `knowledge_bit_source_items_${randomUUID().replace(/-/g, "_")}`;
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

const { getSourceInsertState, insertSourceItemsForChunk } = await import(
  "./knowledge-bit-source-items.repo.js"
);
const { generateItemsForSource, defaultGenerateItemsDeps } = await import(
  "./detect-knowledge-bits.orchestrator.js"
);
const { listKnowledgeBitsForWhQuestionGenerationScan } = await import(
  "./knowledge-bit-wh-question-claim.repo.js"
);
const { listKnowledgeBitsForFillBlankGenerationScan } = await import(
  "./knowledge-bit-fill-blank-claim.repo.js"
);
const { listKnowledgeBitsForBasicCardGenerationScan } = await import(
  "./knowledge-bit-basic-card-claim.repo.js"
);

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

async function seedProcessingSource(rawText = RU_SOURCE_TEXT): Promise<{ id: string; claimedAt: Date }> {
  const id = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', $2, 'processing', $3)`,
    [id, rawText, claimedAt],
  );

  return { id, claimedAt };
}

async function bitsOf(sourceId: string) {
  const result = await client.query(
    `SELECT b.id, b.ordinal, b.body, b.background, b.approval_state, b.wh_question_generated_at,
            b.fill_blank_generated_at, b.basic_card_generated_at, b.wh_question_generation_attempts
       FROM knowledge_bits b WHERE b.knowledge_source_id = $1 ORDER BY b.ordinal`,
    [sourceId],
  );

  return result.rows;
}

async function variantsOf(bitId: string) {
  const result = await client.query(
    `SELECT kind, "order", prompt, answer FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
    [bitId],
  );

  return result.rows;
}

describe("source-first pipeline with the Russian worked example (real Postgres, mocked model)", () => {
  it("should store the four example items as pending bits with one matching variant each", async () => {
    const source = await seedProcessingSource();
    const deps = { ...defaultGenerateItemsDeps(), writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS) };

    const result = await generateItemsForSource(
      { id: source.id, rawText: RU_SOURCE_TEXT, extractionModelId: null, subjectId: null, claimedAt: source.claimedAt },
      {},
      deps,
    );

    expect(result).toEqual({ status: "detected", inserted: 4, failureReason: null });
    expect(deps.writeItems).toHaveBeenCalledTimes(1);

    const bits = await bitsOf(source.id);

    expect(bits.map((bit) => bit.ordinal)).toEqual([0, 1, 2, 3]);
    expect(bits.map((bit) => bit.body)).toEqual(RU_EXAMPLE_ITEMS.map((item) => item.statement));
    expect(bits.every((bit) => bit.approval_state === "pending" && bit.background === null)).toBe(true);

    const variants = [];

    for (const bit of bits) {
      variants.push(await variantsOf(bit.id));
    }

    expect(variants.map((rows) => rows.length)).toEqual([1, 1, 1, 1]);
    expect(variants.map((rows) => rows[0].kind)).toEqual([
      "wh_question",
      "wh_question",
      "basic",
      "fill_in_the_blank",
    ]);
    expect(variants.map((rows) => rows[0].order)).toEqual([0, 0, 0, 0]);
    expect(variants.map((rows) => rows[0].prompt)).toEqual(RU_EXAMPLE_ITEMS.map((item) => item.question));
    expect(variants.map((rows) => rows[0].answer)).toEqual(RU_EXAMPLE_ITEMS.map((item) => item.answer));
    expect(variants[3]?.[0].prompt.match(/____/g)).toHaveLength(1);

    const sourceRow = (
      await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [source.id])
    ).rows[0];

    expect(sourceRow).toEqual({ status: "bits_detected", failure_reason: null });
  });

  it("should stamp every generated-at column so the three old per-bit scans never pick the new bits", async () => {
    const source = await seedProcessingSource();
    const deps = { ...defaultGenerateItemsDeps(), writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS) };

    await generateItemsForSource({ id: source.id, rawText: RU_SOURCE_TEXT, extractionModelId: null, subjectId: null, claimedAt: source.claimedAt }, {}, deps);

    const bits = await bitsOf(source.id);
    const ids = new Set(bits.map((bit) => bit.id));

    expect(
      bits.every(
        (bit) => bit.wh_question_generated_at && bit.fill_blank_generated_at && bit.basic_card_generated_at,
      ),
    ).toBe(true);
    expect(bits.every((bit) => bit.wh_question_generation_attempts === 0)).toBe(true);

    const scans = await Promise.all([
      listKnowledgeBitsForWhQuestionGenerationScan(1000),
      listKnowledgeBitsForFillBlankGenerationScan(1000),
      listKnowledgeBitsForBasicCardGenerationScan(1000),
    ]);

    for (const rows of scans) {
      expect(rows.filter((row) => ids.has(row.id))).toEqual([]);
    }
  });
});

describe("insertSourceItemsForChunk (real Postgres)", () => {
  it("should insert nothing and throw knowledge_source_reclaimed when the claim token no longer matches", async () => {
    const source = await seedProcessingSource();

    await expect(
      insertSourceItemsForChunk({
        sourceId: source.id,
        claimedAt: new Date(source.claimedAt.getTime() - 1000),
        firstOrdinal: 0,
        items: itemsForChunk("late", 2),
      }),
    ).rejects.toThrow("knowledge_source_reclaimed");

    expect(await bitsOf(source.id)).toEqual([]);
  });

  it("should throw knowledge_source_reclaimed once the source is no longer processing", async () => {
    const source = await seedProcessingSource();

    await client.query(`UPDATE knowledge_sources SET status = 'pending' WHERE id = $1`, [source.id]);

    await expect(
      insertSourceItemsForChunk({
        sourceId: source.id,
        claimedAt: source.claimedAt,
        firstOrdinal: 0,
        items: itemsForChunk("late", 1),
      }),
    ).rejects.toThrow("knowledge_source_reclaimed");
  });

  it("should create variants only for bits actually inserted when an ordinal is already taken", async () => {
    const source = await seedProcessingSource();
    const first = itemsForChunk("first", 2);
    const retry = itemsForChunk("retry", 3);

    expect(
      await insertSourceItemsForChunk({ sourceId: source.id, claimedAt: source.claimedAt, firstOrdinal: 0, items: first }),
    ).toBe(2);
    expect(
      await insertSourceItemsForChunk({ sourceId: source.id, claimedAt: source.claimedAt, firstOrdinal: 1, items: retry }),
    ).toBe(2);

    const bits = await bitsOf(source.id);

    expect(bits.map((bit) => bit.body)).toEqual([
      first[0]?.statement,
      first[1]?.statement,
      retry[1]?.statement,
      retry[2]?.statement,
    ]);

    const variantCount = await client.query(
      `SELECT count(*)::int AS n FROM knowledge_bit_question_variants v
         JOIN knowledge_bits b ON b.id = v.knowledge_bit_id WHERE b.knowledge_source_id = $1`,
      [source.id],
    );

    expect(variantCount.rows[0].n).toBe(bits.length);
  });
});

describe("getSourceInsertState (real Postgres)", () => {
  it("should start a fresh source at ordinal 0 with no statements", async () => {
    const source = await seedProcessingSource();

    expect(await getSourceInsertState(source.id)).toEqual({ nextOrdinal: 0, existingStatements: [] });
  });

  it("should continue after the highest ordinal even when that bit was superseded, so a regenerated item never collides", async () => {
    const source = await seedProcessingSource();

    await insertSourceItemsForChunk({
      sourceId: source.id,
      claimedAt: source.claimedAt,
      firstOrdinal: 0,
      items: itemsForChunk("old", 3),
    });
    await client.query(
      `UPDATE knowledge_bits SET approval_state = 'superseded' WHERE knowledge_source_id = $1 AND ordinal = 2`,
      [source.id],
    );

    const state = await getSourceInsertState(source.id);

    expect(state.nextOrdinal).toBe(3);
    expect(state.existingStatements).toHaveLength(2);

    await expect(
      insertSourceItemsForChunk({
        sourceId: source.id,
        claimedAt: source.claimedAt,
        firstOrdinal: state.nextOrdinal,
        items: itemsForChunk("old", 3).slice(2),
      }),
    ).resolves.toBe(1);
  });
});
