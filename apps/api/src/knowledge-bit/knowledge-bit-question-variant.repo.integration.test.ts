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

const dbName = `knowledge_bit_question_variant_${randomUUID().replace(/-/g, "_")}`;
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

const {
  insertQuestionVariant,
  listQuestionVariantsForEmbeddingScan,
  updateQuestionVariantEmbedding,
} = await import("./knowledge-bit-question-variant.repo.js");

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

describe("insertQuestionVariant (real Postgres)", () => {
  it("persists a wh_question variant row tied to the bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to generate a question for");

    await insertQuestionVariant(bitId, "wh_question", 0, "Why does this matter?", "Because of X.");

    const { rows } = await client.query(
      `SELECT knowledge_bit_id, kind, "order", prompt, answer FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [bitId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.knowledge_bit_id).toBe(bitId);
    expect(rows[0]!.kind).toBe("wh_question");
    expect(rows[0]!.order).toBe(0);
    expect(rows[0]!.prompt).toBe("Why does this matter?");
    expect(rows[0]!.answer).toBe("Because of X.");
  });
});

describe("listQuestionVariantsForEmbeddingScan (real Postgres)", () => {
  it("returns exactly the variants with embeddedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with variants");

    await insertQuestionVariant(bitId, "wh_question", 0, "Why unembedded scan A?", "Because.");
    await insertQuestionVariant(
      bitId,
      "fill_in_the_blank",
      0,
      "This unembedded scan B ____ matters.",
      "fact",
    );

    const rows = await listQuestionVariantsForEmbeddingScan(1000);
    const matching = rows.filter(
      (row) => row.prompt === "Why unembedded scan A?" || row.prompt === "This unembedded scan B ____ matters.",
    );

    expect(matching).toHaveLength(2);
    expect(matching.every((row) => row.embeddingHash === null)).toBe(true);
  });

  it("excludes a variant already embedded", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with an embedded variant");

    await insertQuestionVariant(bitId, "wh_question", 0, "Already embedded?", "Yes.");

    const { rows: variantRows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [bitId],
    );
    const variantId = variantRows[0]!.id as string;

    await updateQuestionVariantEmbedding(variantId, [1, 2, 3], "abc123");

    const rows = await listQuestionVariantsForEmbeddingScan(1000);

    expect(rows.map((row) => row.id)).not.toContain(variantId);
  });
});

describe("updateQuestionVariantEmbedding (real Postgres)", () => {
  it("persists embedding/embeddingHash/embeddedAt on read-back", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to embed a variant for");

    await insertQuestionVariant(bitId, "wh_question", 0, "Why embed this?", "To search later.");

    const { rows: variantRows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [bitId],
    );
    const variantId = variantRows[0]!.id as string;

    await updateQuestionVariantEmbedding(variantId, [1, 2, 3], "hash123");

    const { rows } = await client.query(
      `SELECT embedding, embedding_hash, embedded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.embedding).toEqual([1, 2, 3]);
    expect(rows[0]!.embedding_hash).toBe("hash123");
    expect(rows[0]!.embedded_at).toBeInstanceOf(Date);
  });
});
