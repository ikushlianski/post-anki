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

const dbName = `long_paste_split_${randomUUID().replace(/-/g, "_")}`;
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

const { insertSplitKnowledgeSources } = await import("./knowledge-source.repo.js");
const { findEarlierSplitSource } = await import("./knowledge-source-duplicate.repo.js");
const { discardKnowledgeSource } = await import("./knowledge-source-discard.repo.js");

let client: pg.Client;

const options = { subjectId: null, modelId: null, sourceUrl: null, importKeyBase: "split:0123456789abcdef" };

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

describe("insertSplitKnowledgeSources", () => {
  it("should insert the parts of one paste only once when the same key base is used again", async () => {
    const first = await insertSplitKnowledgeSources(["part one", "part two"], options);
    const second = await insertSplitKnowledgeSources(["part one", "part two"], options);
    const earlier = await findEarlierSplitSource(options.importKeyBase);
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM knowledge_sources`);

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
    expect(rows[0].n).toBe(2);
    expect(first.map((row) => row.id)).toContain(earlier?.id);
  });

  it("should insert none of the parts when a racing paste split into a different number of parts", async () => {
    const base = "split:fedcba9876543210";

    await insertSplitKnowledgeSources(["alpha", "beta"], { ...options, importKeyBase: base });

    const racing = await insertSplitKnowledgeSources(["a", "b", "c"], { ...options, importKeyBase: base });
    const { rows } = await client.query(`SELECT import_key FROM knowledge_sources WHERE import_key LIKE $1`, [`${base}:%`]);

    expect(racing).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it("should write no import keys when the base is null", async () => {
    const rows = await insertSplitKnowledgeSources(["x", "y"], { ...options, importKeyBase: null });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.importKey === null)).toBe(true);
  });
});
