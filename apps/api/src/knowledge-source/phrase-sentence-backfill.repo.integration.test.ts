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

const dbName = `phrase_sentence_backfill_${randomUUID().replace(/-/g, "_")}`;
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

const { applyPhraseContextSplits, listPhraseContextSplits, listPhraseSentenceBackfillCandidates } = await import("./phrase-sentence-backfill.repo.js");

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

async function seedSource(
  kind: "phrase" | "prose",
  bits: Array<{ state: "pending" | "approved"; variants: number; fronts?: "same" | "distinct" }>,
): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, $2, 'Phrase: touch base', 'bits_detected')`, [
    sourceId,
    kind,
  ]);

  for (const [ordinal, bit] of bits.entries()) {
    const bitId = `kb_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, 'touch base', $4)`,
      [bitId, sourceId, ordinal, bit.state],
    );

    for (let order = 0; order < bit.variants; order += 1) {
      await client.query(
        `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
         VALUES ($1, $2, 'basic', $3, $4, 'A')`,
        [`kbqv_${randomUUID()}`, bitId, order, bit.fronts === "distinct" ? `P${order}` : "P"],
      );
    }
  }

  return sourceId;
}

async function countRows(table: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS total FROM ${table}`);

  return rows[0].total as number;
}

describe("listPhraseSentenceBackfillCandidates (real Postgres)", () => {
  it("should only pick phrase sources whose cards are all pending and single", async () => {
    const eligible = await seedSource("phrase", [{ state: "pending", variants: 1 }]);

    await seedSource("phrase", [{ state: "approved", variants: 1 }]);
    await seedSource("phrase", [{ state: "pending", variants: 3, fronts: "distinct" }]);
    await seedSource("phrase", [
      { state: "pending", variants: 1 },
      { state: "approved", variants: 1 },
    ]);
    await seedSource("prose", [{ state: "pending", variants: 1 }]);

    const candidates = await listPhraseSentenceBackfillCandidates();

    expect(candidates.map((candidate) => candidate.id)).toEqual([eligible]);
  });

  it("should pick a phrase whose three sentences still share one front so each gets its own situation", async () => {
    const shared = await seedSource("phrase", [{ state: "pending", variants: 3, fronts: "same" }]);

    const candidates = await listPhraseSentenceBackfillCandidates();

    expect(candidates.map((candidate) => candidate.id)).toContain(shared);
  });

  it("should change nothing when listing candidates (dry run)", async () => {
    await seedSource("phrase", [{ state: "pending", variants: 1 }]);
    const before = [await countRows("knowledge_bits"), await countRows("knowledge_bit_question_variants")];

    await listPhraseSentenceBackfillCandidates();

    expect([await countRows("knowledge_bits"), await countRows("knowledge_bit_question_variants")]).toEqual(before);
  });

  it("should stop at the requested limit", async () => {
    await seedSource("phrase", [{ state: "pending", variants: 1 }]);

    expect(await listPhraseSentenceBackfillCandidates({ limit: 1 })).toHaveLength(1);
  });
});

describe("phrase context split (real Postgres)", () => {
  async function seedPrompt(kind: "phrase" | "prose", prompt: string, context: string | null = null): Promise<string> {
    const sourceId = await seedSource(kind, [{ state: "pending", variants: 0 }]);
    const { rows } = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);
    const variantId = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, context)
       VALUES ($1, $2, 'basic', 0, $3, 'A', $4)`,
      [variantId, rows[0].id, prompt, context],
    );

    return variantId;
  }

  async function readVariant(id: string): Promise<{ prompt: string; context: string | null }> {
    const { rows } = await client.query(`SELECT prompt, context FROM knowledge_bit_question_variants WHERE id = $1`, [id]);

    return rows[0];
  }

  it("should list only two-line phrase fronts that have no context yet", async () => {
    const two = await seedPrompt("phrase", "Formal moment\nTo a manager");
    const one = await seedPrompt("phrase", "Formal moment");
    const done = await seedPrompt("phrase", "Formal moment\nTo a manager", "To a manager");
    const prose = await seedPrompt("prose", "Formal moment\nTo a manager");

    const ids = (await listPhraseContextSplits()).map((split) => split.variantId);

    expect(ids).toContain(two);
    expect(ids).not.toContain(one);
    expect(ids).not.toContain(done);
    expect(ids).not.toContain(prose);
  });

  it("should move line two into context on apply and leave the model out of it", async () => {
    const id = await seedPrompt("phrase", "Formal moment\nTo a manager");

    await applyPhraseContextSplits((await listPhraseContextSplits()).filter((split) => split.variantId === id));

    expect(await readVariant(id)).toEqual({ prompt: "Formal moment", context: "To a manager" });
  });

  it("should list only the splits of the requested card when a card id is given", async () => {
    const mine = await seedPrompt("phrase", "Formal moment\nTo a manager");
    const other = await seedPrompt("phrase", "Casual moment\nTo a friend");
    const { rows } = await client.query(`SELECT knowledge_bit_id FROM knowledge_bit_question_variants WHERE id = $1`, [mine]);

    const ids = (await listPhraseContextSplits(undefined, rows[0].knowledge_bit_id)).map((split) => split.variantId);

    expect(ids).toEqual([mine]);
    expect(ids).not.toContain(other);
  });

  it("should change nothing when only listing the splits", async () => {
    const id = await seedPrompt("phrase", "Formal moment\nTo a manager");

    await listPhraseContextSplits();

    expect(await readVariant(id)).toEqual({ prompt: "Formal moment\nTo a manager", context: null });
  });
});
