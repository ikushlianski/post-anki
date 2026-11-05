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

const dbName = `knowledge_source_highlights_${randomUUID().replace(/-/g, "_")}`;
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

const { insertKnowledgeSource } = await import("./knowledge-source.repo.js");
const { claimSourceForRegeneration } = await import("./knowledge-source-regeneration.repo.js");
const { loadHighlights } = await import("../knowledge-bit/knowledge-source-kind.repo.js");

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

async function seedFailed(rawText: string, highlights: unknown): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status, highlights) VALUES ($1, 'prose', $2, 'bits_detected', $3)`, [
    id,
    rawText,
    JSON.stringify(highlights),
  ]);

  return id;
}

describe("knowledge source highlights storage", () => {
  it("should store and read back the marked ranges of a new source", async () => {
    const source = await insertKnowledgeSource("alpha beta gamma", null, null, null, undefined, [{ start: 6, end: 10 }]);

    expect(await loadHighlights(source.id)).toEqual([{ start: 6, end: 10 }]);
  });

  it("should read no marks for a source added without any", async () => {
    const source = await insertKnowledgeSource("alpha beta gamma");

    expect(await loadHighlights(source.id)).toEqual([]);
  });

  it("should keep the marks when a source is regenerated with its stored text", async () => {
    const id = await seedFailed("alpha beta gamma", [{ start: 0, end: 5 }]);

    const claimed = await claimSourceForRegeneration(id);

    expect(claimed.ok).toBe(true);
    expect(await loadHighlights(id)).toEqual([{ start: 0, end: 5 }]);
  });

  it("should clear the marks when the source text is replaced", async () => {
    const id = await seedFailed("alpha beta gamma", [{ start: 0, end: 5 }]);

    const claimed = await claimSourceForRegeneration(id, { replacementText: "completely new text" });

    expect(claimed.ok).toBe(true);
    expect(await loadHighlights(id)).toEqual([]);
  });
});
