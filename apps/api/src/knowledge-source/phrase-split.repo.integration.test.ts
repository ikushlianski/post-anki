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

const dbName = `phrase_split_${randomUUID().replace(/-/g, "_")}`;
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
process.env.LLM_MODE = "mock";

const { isLivePhraseKnowledgeBit, listPhraseBitVariants } = await import("./phrase-split.repo.js");
const { listPhraseContextSplits } = await import("./phrase-sentence-backfill.repo.js");
const { splitPhraseContextsAndRefreshEmbeddings } = await import("./phrase-context-split.orchestrator.js");

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

async function seedBit(kind: "phrase" | "prose", state: "pending" | "approved" | "superseded"): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, $2, 'Phrase: touch base', 'bits_detected')`, [
    sourceId,
    kind,
  ]);
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'touch base', $3)`,
    [bitId, sourceId, state],
  );

  return bitId;
}

async function seedVariant(bitId: string, order: number, prompt: string): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'basic', $3, $4, 'A')`,
    [id, bitId, order, prompt],
  );

  return id;
}

describe("isLivePhraseKnowledgeBit (real Postgres)", () => {
  it("should accept a live phrase card", async () => {
    expect(await isLivePhraseKnowledgeBit(await seedBit("phrase", "pending"))).toBe(true);
    expect(await isLivePhraseKnowledgeBit(await seedBit("phrase", "approved"))).toBe(true);
  });

  it("should reject a phrase card that was superseded", async () => {
    expect(await isLivePhraseKnowledgeBit(await seedBit("phrase", "superseded"))).toBe(false);
  });

  it("should reject a card that does not come from a phrase", async () => {
    expect(await isLivePhraseKnowledgeBit(await seedBit("prose", "approved"))).toBe(false);
  });

  it("should reject an id that does not exist", async () => {
    expect(await isLivePhraseKnowledgeBit(`kb_${randomUUID()}`)).toBe(false);
  });
});

describe("listPhraseBitVariants (real Postgres)", () => {
  it("should return the card's variants in the order they were created", async () => {
    const bitId = await seedBit("phrase", "pending");
    const first = await seedVariant(bitId, 0, "First");
    const second = await seedVariant(bitId, 1, "Second");
    const third = await seedVariant(bitId, 2, "Third");

    const variants = await listPhraseBitVariants(bitId);

    expect(variants.map((variant) => variant.id)).toEqual([first, second, third]);
    expect(variants.map((variant) => variant.prompt)).toEqual(["First", "Second", "Third"]);
  });

  it("should leave out variants that belong to another card", async () => {
    const mine = await seedBit("phrase", "pending");
    const other = await seedBit("phrase", "pending");
    const own = await seedVariant(mine, 0, "Mine");

    await seedVariant(other, 0, "Other");

    expect((await listPhraseBitVariants(mine)).map((variant) => variant.id)).toEqual([own]);
  });
});

describe("splitting a phrase with several situations (real Postgres)", () => {
  it("should give the phrase one card per situation, each situation appearing once", async () => {
    const bitId = await seedBit("phrase", "pending");
    const contexts = ["To a manager", "To a friend", "In a standup"];

    for (const [order, context] of contexts.entries()) {
      await seedVariant(bitId, order, `Ask for a quick sync\n${context}`);
    }

    const splits = await listPhraseContextSplits(undefined, bitId);
    const updated = await splitPhraseContextsAndRefreshEmbeddings(splits);
    const variants = await listPhraseBitVariants(bitId);

    expect(updated).toBe(contexts.length);
    expect(variants).toHaveLength(contexts.length);
    expect(variants.map((variant) => variant.context).sort()).toEqual([...contexts].sort());
    expect(variants.every((variant) => variant.prompt === "Ask for a quick sync")).toBe(true);
  });

  it("should not create extra cards when the split is requested twice", async () => {
    const bitId = await seedBit("phrase", "pending");

    await seedVariant(bitId, 0, "Ask for a quick sync\nTo a manager");
    await seedVariant(bitId, 1, "Ask for a quick sync\nTo a friend");

    await splitPhraseContextsAndRefreshEmbeddings(await listPhraseContextSplits(undefined, bitId));
    const secondRun = await splitPhraseContextsAndRefreshEmbeddings(await listPhraseContextSplits(undefined, bitId));

    expect(secondRun).toBe(0);
    expect(await listPhraseBitVariants(bitId)).toHaveLength(2);
  });
});
