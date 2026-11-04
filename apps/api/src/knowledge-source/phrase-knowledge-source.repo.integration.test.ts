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

const dbName = `phrase_sources_${randomUUID().replace(/-/g, "_")}`;
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

const { insertPhraseKnowledgeSources } = await import("./phrase-knowledge-source.repo.js");
const { ensureEnglishForItSubject } = await import("../subject/seed/english-sub-subjects.seed.js");

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

describe("insertPhraseKnowledgeSources", () => {
  it("should store one source when two identical posts arrive at the same time", async () => {
    const item = [{ key: "phrase:touch base", text: "Phrase: touch base" }];

    await Promise.all([
      insertPhraseKnowledgeSources(item, "sub_x"),
      insertPhraseKnowledgeSources(item, "sub_x"),
    ]);

    const { rows } = await client.query(
      `SELECT kind, subject_id FROM knowledge_sources WHERE import_key = 'phrase:touch base'`,
    );

    expect(rows).toEqual([{ kind: "phrase", subject_id: "sub_x" }]);
  });

  it("should report only the new phrases when a post repeats an old one", async () => {
    await insertPhraseKnowledgeSources([{ key: "phrase:a", text: "Phrase: a" }], "sub_x");

    const created = await insertPhraseKnowledgeSources(
      [
        { key: "phrase:a", text: "Phrase: a" },
        { key: "phrase:b", text: "Phrase: b" },
      ],
      "sub_x",
    );

    expect(created.map((row) => row.rawText)).toEqual(["Phrase: b"]);
  });
});

describe("ensureEnglishForItSubject", () => {
  it("should create English and English for IT once and reuse them afterwards", async () => {
    const first = await ensureEnglishForItSubject();
    const second = await Promise.all([ensureEnglishForItSubject(), ensureEnglishForItSubject()]);

    expect(second).toEqual([first, first]);

    const { rows } = await client.query(
      `SELECT name, parent_id FROM subjects WHERE name IN ('English', 'English for IT') ORDER BY name`,
    );

    expect(rows).toHaveLength(2);
    expect(rows[1].parent_id).not.toBeNull();
  });
});
