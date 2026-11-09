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

const dbName = `reconcile_${randomUUID().replace(/-/g, "_")}`;
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

const { reconcileDurableSources } = await import("./durable-extraction.reconcile.js");

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

async function seedProcessing(ageMinutes: number): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at) VALUES ($1, 'prose', 'text', 'processing', $2, now() - ($3 || ' minutes')::interval)`,
    [id, `durable:${id}:1`, String(ageMinutes)],
  );

  return id;
}

describe("reconcileDurableSources", () => {
  it("should fail processing sources older than the stale cutoff", async () => {
    const stale = await seedProcessing(120);
    const fresh = await seedProcessing(1);

    const failed = await reconcileDurableSources();
    const rows = await client.query(`SELECT id, status, failure_reason FROM knowledge_sources WHERE id = ANY($1)`, [[stale, fresh]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

    expect(failed).toContain(stale);
    expect(failed).not.toContain(fresh);
    expect(byId[stale]).toMatchObject({ status: "failed", failure_reason: "workflow_executor_lost" });
    expect(byId[fresh].status).toBe("processing");
  }, 60_000);
});
