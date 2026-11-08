import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({
  kickSourcesAfterAdd: vi.fn(async () => {}),
}));

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

const dbName = `mcp_submit_knowledge_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { submitKnowledge } = await import("./submit-knowledge.tool.js");
const { createSubjectSeedStore } = await import("../subject/seed/subject-seed.store.js");
const { getDb } = await import("../db/client.js");

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

const writer = { scopes: ["knowledge:write"] };

function notes(...keys: string[]) {
  return keys.map((key) => ({ key, text: `Text of ${key}` }));
}

async function countRows(): Promise<number> {
  const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM knowledge_sources`);

  return Number(rows[0]!.n);
}

describe("submit_knowledge against a real database", () => {
  it("should report subject_missing and insert nothing when the Business root does not exist", async () => {
    const result = await submitKnowledge({ deck: "Маркетинг и СММ", notes: notes("anki:missing01") }, writer);

    expect(result).toEqual({ error: "subject_missing", subjectName: "Marketing" });
    expect(await countRows()).toBe(0);
  });

  it("should file three notes as pending prose sources under Marketing with the caller's keys", async () => {
    const store = createSubjectSeedStore(getDb());
    const rootId = await store.createRoot("Business", "Business courses");
    const marketingId = await store.createChild(rootId, "Marketing");

    const result = await submitKnowledge(
      { deck: "Маркетинг и СММ", notes: notes("anki:aaaaaaa1", "anki:aaaaaaa2", "anki:aaaaaaa3") },
      writer,
    );

    expect(result).toMatchObject({ subjectId: marketingId, subjectName: "Marketing", created: 3, alreadyPresent: 0 });

    const { rows } = await client.query(
      `SELECT import_key, kind, status, subject_id FROM knowledge_sources ORDER BY import_key`,
    );

    expect(rows).toEqual(
      ["anki:aaaaaaa1", "anki:aaaaaaa2", "anki:aaaaaaa3"].map((import_key) => ({
        import_key,
        kind: "prose",
        status: "pending",
        subject_id: marketingId,
      })),
    );
  });

  it("should add only the new note when a batch is re-sent with one extra note", async () => {
    const result = await submitKnowledge(
      {
        deck: "Маркетинг воронка",
        notes: notes("anki:aaaaaaa1", "anki:aaaaaaa2", "anki:aaaaaaa3", "anki:aaaaaaa4"),
      },
      writer,
    );

    expect(result).toMatchObject({ created: 1, alreadyPresent: 3 });
    expect(await countRows()).toBe(4);
  });

  it("should leave one row per key when the same batch is submitted twice concurrently", async () => {
    const batch = notes("anki:bbbbbbb1", "anki:bbbbbbb2");
    const results = await Promise.all([
      submitKnowledge({ deck: "Маркетинг и СММ", notes: batch }, writer),
      submitKnowledge({ deck: "Маркетинг и СММ", notes: batch }, writer),
    ]);
    const created = results.reduce((sum, r) => sum + ("created" in r ? r.created : 0), 0);

    expect(created).toBe(2);
    expect(await countRows()).toBe(6);
  });

  it("should store one row when two notes in a batch share a key", async () => {
    const result = await submitKnowledge(
      { deck: "Маркетинг и СММ", notes: notes("anki:ccccccc1", "anki:ccccccc1") },
      writer,
    );

    expect(result).toMatchObject({ created: 1, alreadyPresent: 1 });
    expect(await countRows()).toBe(7);
  });

  it("should refuse an unknown deck and insert nothing", async () => {
    const result = await submitKnowledge({ deck: "Cooking", notes: notes("anki:ddddddd1") }, writer);

    expect(result).toEqual({ error: "unknown_deck" });
    expect(await countRows()).toBe(7);
  });
});
