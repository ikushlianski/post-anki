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

const dbName = `nothing_extracted_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getNothingExtractedStatistics } = await import("./nothing-extracted-statistics.service.js");

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

describe("getNothingExtractedStatistics", () => {
  it("should count detected sources and nothing-extracted ones in the current week and ignore unfinished or old ones", async () => {
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at, nothing_extracted_at)
       VALUES ('n1','text','x','bits_detected',now(),now()),
              ('n2','text','x','bits_detected',now(),NULL),
              ('n3','text','x','bits_detected',now(),NULL),
              ('n4','text','x','pending',now(),NULL),
              ('n5','text','x','bits_detected',now() - interval '400 days',NULL)`,
    );

    const result = await getNothingExtractedStatistics();
    const current = result.weekly.at(-1);

    expect(result.weekly).toHaveLength(12);
    expect(current?.processed).toBe(3);
    expect(current?.nothingExtracted).toBe(1);
    expect(current?.rate).toBeCloseTo(1 / 3);
  });
});
