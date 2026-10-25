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

const dbName = `knowledge_source_discard_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;

const { discardKnowledgeSource } = await import("./knowledge-source-discard.repo.js");

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

async function seedSource(status: string): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason) VALUES ($1, 'prose', 'text', $2, 'no_valid_items')`,
    [id, status],
  );

  return id;
}

async function seedBit(sourceId: string, ordinal: number, state: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, 'b', $4)`,
    [id, sourceId, ordinal, state],
  );

  return id;
}

async function count(table: string, column: string, value: string): Promise<number> {
  return Number((await client.query(`SELECT count(*) FROM ${table} WHERE ${column} = $1`, [value])).rows[0].count);
}

describe("discardKnowledgeSource (real Postgres)", () => {
  it("should delete a note with no approved cards together with all its cards", async () => {
    const sourceId = await seedSource("failed");

    await seedBit(sourceId, 0, "pending");
    await seedBit(sourceId, 1, "superseded");

    const result = await discardKnowledgeSource(sourceId);

    expect(result).toMatchObject({ ok: true, counts: { knowledgeSources: 1, knowledgeBits: 2 } });
    expect(await count("knowledge_sources", "id", sourceId)).toBe(0);
    expect(await count("knowledge_bits", "knowledge_source_id", sourceId)).toBe(0);
  });

  it("should keep approved cards and their note, removing only the unapproved ones", async () => {
    const sourceId = await seedSource("failed");
    const approved = await seedBit(sourceId, 0, "approved");

    await seedBit(sourceId, 1, "pending");
    await seedBit(sourceId, 2, "rejected");

    const result = await discardKnowledgeSource(sourceId);

    expect(result).toMatchObject({ ok: true, counts: { knowledgeSources: 0, knowledgeBits: 2 } });
    expect(await count("knowledge_bits", "id", approved)).toBe(1);
    expect(await count("knowledge_bits", "knowledge_source_id", sourceId)).toBe(1);

    const row = (await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]))
      .rows[0];

    expect(row).toEqual({ status: "bits_detected", failure_reason: null });
  });

  it("should leave other notes alone and answer not_found for an unknown note", async () => {
    const sourceId = await seedSource("failed");
    const otherId = await seedSource("failed");

    await seedBit(otherId, 0, "pending");
    await discardKnowledgeSource(sourceId);

    expect(await count("knowledge_bits", "knowledge_source_id", otherId)).toBe(1);
    expect(await discardKnowledgeSource("ksrc_missing")).toEqual({ ok: false, error: "not_found" });
  });
});
