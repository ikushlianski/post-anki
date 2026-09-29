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

const dbName = `tag_repo_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { assignTag, resolveOrCreateTag } = await import("./tag.repo.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

describe("assignTag (real Postgres)", () => {
  it("inserts a fresh row with source 'manual' when nothing existed", async () => {
    const tag = await resolveOrCreateTag(`fresh-manual-${randomUUID()}`);
    const nodeId = id("topic");

    await assignTag(tag.id, "topic", nodeId);

    const { rows } = await client.query(
      `SELECT source FROM tag_assignments WHERE tag_id = $1 AND node_id = $2`,
      [tag.id, nodeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("manual");
  });

  it("upgrades an existing auto-sourced row to manual on conflict", async () => {
    const tag = await resolveOrCreateTag(`upgrade-${randomUUID()}`);
    const nodeId = id("topic");

    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id, source) VALUES ($1, $2, 'topic', $3, 'auto')`,
      [id("tga"), tag.id, nodeId],
    );

    await assignTag(tag.id, "topic", nodeId);

    const { rows } = await client.query(
      `SELECT source FROM tag_assignments WHERE tag_id = $1 AND node_id = $2`,
      [tag.id, nodeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("manual");
  });
});

describe("tag_assignments 'source' column defaults (real Postgres)", () => {
  it("a pre-migration row inserted with no source value reads back as 'manual'", async () => {
    const tag = await resolveOrCreateTag(`pre-migration-${randomUUID()}`);
    const nodeId = id("topic");
    const assignmentId = id("tga");

    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, 'topic', $3)`,
      [assignmentId, tag.id, nodeId],
    );

    const { rows } = await client.query(`SELECT source FROM tag_assignments WHERE id = $1`, [
      assignmentId,
    ]);

    expect(rows[0]!.source).toBe("manual");
  });
});
