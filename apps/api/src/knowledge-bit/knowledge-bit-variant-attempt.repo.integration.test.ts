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

const dbName = `knowledge_bit_variant_attempt_${randomUUID().replace(/-/g, "_")}`;
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

const { getQuestionVariantById, insertVariantAttempt } = await import(
  "./knowledge-bit-variant-attempt.repo.js"
);
const { insertQuestionVariant } = await import("./knowledge-bit-question-variant.repo.js");

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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );

  return id;
}

async function seedKnowledgeBit(knowledgeSourceId: string, ordinal: number, body: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body) VALUES ($1, $2, $3, $4)`,
    [id, knowledgeSourceId, ordinal, body],
  );

  return id;
}

async function seedVariant(
  bitId: string,
  prompt: string,
  answer: string,
  kind: "wh_question" | "fill_in_the_blank" = "wh_question",
): Promise<string> {
  await insertQuestionVariant(bitId, kind, 0, prompt, answer);

  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND kind = $2`,
    [bitId, kind],
  );

  return rows[0]!.id as string;
}

describe("getQuestionVariantById (real Postgres)", () => {
  it("returns the variant's id, kind, prompt, and answer", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a variant to grade");
    const variantId = await seedVariant(bitId, "Why does this matter?", "Because of X.");

    const row = await getQuestionVariantById(variantId);

    expect(row).toEqual({
      id: variantId,
      kind: "wh_question",
      prompt: "Why does this matter?",
      answer: "Because of X.",
    });
  });

  it("returns kind fill_in_the_blank for a fill-blank variant, not defaulting to wh_question", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a fill-blank variant to grade");
    const variantId = await seedVariant(
      bitId,
      "An initial price ____ shifts what feels fair later.",
      "anchor",
      "fill_in_the_blank",
    );

    const row = await getQuestionVariantById(variantId);

    expect(row?.kind).toBe("fill_in_the_blank");
  });

  it("returns null for a variant id that doesn't exist", async () => {
    const row = await getQuestionVariantById(`kbqv_${randomUUID()}`);

    expect(row).toBeNull();
  });
});

describe("insertVariantAttempt (real Postgres)", () => {
  it("persists an attempt row tied to the variant", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to record an attempt for");
    const variantId = await seedVariant(bitId, "Why?", "Because.");

    await insertVariantAttempt({
      variantId,
      userAnswer: "Because of X.",
      score: 7,
      verdict: "Ok",
      feedback: "Good reasoning.",
    });

    const { rows } = await client.query(
      `SELECT variant_id, user_answer, score, verdict, feedback FROM knowledge_bit_variant_attempts WHERE variant_id = $1`,
      [variantId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.variant_id).toBe(variantId);
    expect(rows[0]!.user_answer).toBe("Because of X.");
    expect(rows[0]!.score).toBe(7);
    expect(rows[0]!.verdict).toBe("Ok");
    expect(rows[0]!.feedback).toBe("Good reasoning.");
  });

  it("preserves two attempts against the same variant as separate rows, neither overwriting the other", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit answered twice");
    const variantId = await seedVariant(bitId, "Why twice?", "Because twice.");

    await insertVariantAttempt({
      variantId,
      userAnswer: "First try.",
      score: 3,
      verdict: "NeedsDeepDive",
      feedback: "Missed the point.",
    });
    await insertVariantAttempt({
      variantId,
      userAnswer: "Second try, better.",
      score: 8,
      verdict: "Ok",
      feedback: "Much closer.",
    });

    const { rows } = await client.query(
      `SELECT user_answer, score FROM knowledge_bit_variant_attempts WHERE variant_id = $1 ORDER BY created_at`,
      [variantId],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.user_answer).toBe("First try.");
    expect(rows[1]!.user_answer).toBe("Second try, better.");
  });
});
