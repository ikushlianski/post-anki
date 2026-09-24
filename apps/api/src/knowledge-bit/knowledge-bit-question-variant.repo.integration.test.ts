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
  listKnowledgeBitsForQuestionGenerationScan,
  insertQuestionVariant,
  markWhQuestionGenerated,
  markWhQuestionGenerationFailed,
  recordGeneratedQuestionVariant,
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

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  whQuestionGeneratedAt: Date | null = null,
  whQuestionGenerationFailedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits
       (id, knowledge_source_id, ordinal, body, wh_question_generated_at, wh_question_generation_failed_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, knowledgeSourceId, ordinal, body, whQuestionGeneratedAt, whQuestionGenerationFailedAt],
  );

  return id;
}

describe("listKnowledgeBitsForQuestionGenerationScan (real Postgres)", () => {
  it("returns exactly the bits with whQuestionGeneratedAt IS NULL AND whQuestionGenerationFailedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const untouchedId = await seedKnowledgeBit(sourceId, 0, "An ungenerated bit");

    await seedKnowledgeBit(sourceId, 1, "An already-generated bit", new Date(), null);
    await seedKnowledgeBit(sourceId, 2, "A permanently-failed bit", null, new Date());

    const rows = await listKnowledgeBitsForQuestionGenerationScan(100);

    expect(rows).toEqual([{ id: untouchedId, body: "An ungenerated bit" }]);
  });
});

describe("insertQuestionVariant + markWhQuestionGenerated (real Postgres)", () => {
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

  it("persists whQuestionGeneratedAt on read-back after marking a bit generated", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to mark generated");

    await markWhQuestionGenerated(id);

    const { rows } = await client.query(
      `SELECT wh_question_generated_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.wh_question_generated_at).toBeInstanceOf(Date);
  });

  it("persists whQuestionGenerationFailedAt on read-back after marking a bit failed", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to mark failed");

    await markWhQuestionGenerationFailed(id);

    const { rows } = await client.query(
      `SELECT wh_question_generation_failed_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.wh_question_generation_failed_at).toBeInstanceOf(Date);
  });
});

describe("recordGeneratedQuestionVariant (real Postgres)", () => {
  it("inserts the variant and stamps whQuestionGeneratedAt in one transaction", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to record a question for");

    await recordGeneratedQuestionVariant(bitId, "wh_question", 0, "Why does this matter?", "Because of X.");

    const { rows: variantRows } = await client.query(
      `SELECT knowledge_bit_id, kind, "order" FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [bitId],
    );
    const { rows: bitRows } = await client.query(
      `SELECT wh_question_generated_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(variantRows).toHaveLength(1);
    expect(bitRows[0]!.wh_question_generated_at).toBeInstanceOf(Date);
  });

  it("rejects a second variant for the same bit, kind, and slot via the unique index", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit that already has a variant");

    await insertQuestionVariant(bitId, "wh_question", 0, "First question?", "First answer.");

    await expect(
      insertQuestionVariant(bitId, "wh_question", 0, "Second question?", "Second answer."),
    ).rejects.toThrow();
  });
});
