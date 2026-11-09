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

const dbName = `pending_sources_${randomUUID().replace(/-/g, "_")}`;
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

const { listStalePendingSourceIds } = await import("./pending-sources.repo.js");

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

async function seed(status: string, ageMinutes: number): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', 'text', $2, now() - ($3 || ' minutes')::interval)`,
    [id, status, String(ageMinutes)],
  );

  return id;
}

describe("listStalePendingSourceIds (real Postgres)", () => {
  it("should list only pending sources older than the cutoff, oldest first, up to the limit", async () => {
    const oldest = await seed("pending", 60);
    const older = await seed("pending", 30);
    const oldToo = await seed("pending", 20);

    await seed("pending", 1);
    await seed("processing", 90);
    await seed("failed", 90);

    const fiveMin = 5 * 60 * 1000;

    expect(await listStalePendingSourceIds(fiveMin, 20)).toEqual([oldest, older, oldToo]);
    expect(await listStalePendingSourceIds(fiveMin, 2)).toEqual([oldest, older]);
  });
});
