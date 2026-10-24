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

const dbName = `knowledge_source_text_${randomUUID().replace(/-/g, "_")}`;
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

const { getKnowledgeSourceText } = await import("./knowledge-source-text.repo.js");

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

async function seedSource(rawText: string | null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'bits_detected')`, [
    id,
    rawText,
  ]);

  return id;
}

describe("getKnowledgeSourceText", () => {
  it("should return the full pasted text of a stored source", async () => {
    const id = await seedSource("Redis хранит данные в памяти.\n\nTTL задаёт время жизни ключа.");

    expect(await getKnowledgeSourceText(id)).toBe("Redis хранит данные в памяти.\n\nTTL задаёт время жизни ключа.");
  });

  it("should return nothing for a source that does not exist", async () => {
    expect(await getKnowledgeSourceText("ksrc_missing")).toBeNull();
  });

  it("should return nothing for a source with no text or only whitespace", async () => {
    const empty = await seedSource(null);
    const blank = await seedSource("   \n  ");

    expect(await getKnowledgeSourceText(empty)).toBeNull();
    expect(await getKnowledgeSourceText(blank)).toBeNull();
  });
});
