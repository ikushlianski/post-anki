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

const dbName = `knowledge_bit_text_match_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
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

const { listKnowledgeBitOverview } = await import("./knowledge-bit-overview.repo.js");
const { getDb } = await import("../db/client.js");

let client: pg.Client;

async function addPiece(prompt: string, answer: string, superseded = false): Promise<string> {
  const source = `ksrc_${randomUUID()}`;
  const bit = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'text', 'pending')`,
    [source],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bit, source],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'live', 'live')`,
    [`kbqv_${randomUUID()}`, bit],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at) VALUES ($1, $2, 'basic', 1, $3, $4, $5)`,
    [`kbqv_${randomUUID()}`, bit, prompt, answer, superseded ? new Date() : null],
  );

  return bit;
}

async function search(q: string): Promise<string[]> {
  const page = await listKnowledgeBitOverview({ q, limit: 50, offset: 0 }, new Date(), getDb());

  return page.items.map((item) => item.knowledgeBitId);
}

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

describe("study overview word search (real Postgres)", () => {
  it("should find a piece by letters in its question or answer in any case", async () => {
    const byQuestion = await addPiece("Which Zebra runs fastest", "n/a");
    const byAnswer = await addPiece("n/a", "Карточки для повторения");

    expect(await search("zebra")).toEqual([byQuestion]);
    expect(await search("КАРТОЧ")).toEqual([byAnswer]);
  });

  it("should match percent literally and ignore replaced phrasings", async () => {
    const literal = await addPiece("Gain is 100% sure", "n/a");

    await addPiece("Gain is 1000 sure", "n/a");
    await addPiece("old wording quokka", "n/a", true);

    expect(await search("100%")).toEqual([literal]);
    expect(await search("quokka")).toEqual([]);
  });
});
