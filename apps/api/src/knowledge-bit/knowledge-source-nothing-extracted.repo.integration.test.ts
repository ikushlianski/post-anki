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

const dbName = `knowledge_source_nothing_extracted_${randomUUID().replace(/-/g, "_")}`;
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

const { markKnowledgeSourceNothingExtracted } = await import("./knowledge-source-nothing-extracted.repo.js");
const { markKnowledgeSourceBitsDetected } = await import("./knowledge-bit.repo.js");

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

const CLAIMED_AT = new Date("2026-06-01T12:00:00Z");

async function seedProcessing(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', 'Hello all', 'processing', $2)`,
    [id, CLAIMED_AT],
  );

  return id;
}

async function rowOf(id: string): Promise<{ status: string; nothing_extracted_at: Date | null }> {
  const result = await client.query(`SELECT status, nothing_extracted_at FROM knowledge_sources WHERE id = $1`, [id]);

  return result.rows[0];
}

describe("markKnowledgeSourceNothingExtracted", () => {
  it("should finish a claimed note as detected with the nothing-extracted marker set", async () => {
    const id = await seedProcessing();

    expect(await markKnowledgeSourceNothingExtracted(id, CLAIMED_AT)).toBe(true);
    expect(await rowOf(id)).toMatchObject({ status: "bits_detected", nothing_extracted_at: expect.any(Date) });
  });

  it("should refuse when the note was reclaimed by another run", async () => {
    const id = await seedProcessing();

    expect(await markKnowledgeSourceNothingExtracted(id, new Date("2026-06-01T11:00:00Z"))).toBe(false);
    expect((await rowOf(id)).nothing_extracted_at).toBeNull();
  });

  it("should clear the marker when a later run finishes with cards", async () => {
    const id = await seedProcessing();

    await markKnowledgeSourceNothingExtracted(id, CLAIMED_AT);

    const claimedAgain = new Date("2026-06-02T12:00:00Z");

    await client.query(`UPDATE knowledge_sources SET status = 'processing', updated_at = $2 WHERE id = $1`, [id, claimedAgain]);

    expect(await markKnowledgeSourceBitsDetected(id, claimedAgain)).toBe(true);
    expect((await rowOf(id)).nothing_extracted_at).toBeNull();
  });
});
