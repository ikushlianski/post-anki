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

const { assignTag, resolveOrCreateTag, renameTag, deleteTag, getTag } =
  await import("./tag.repo.js");

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

describe("renameTag (real Postgres)", () => {
  it("should store the trimmed name and its normalized form", async () => {
    const tag = await resolveOrCreateTag(`before-${randomUUID()}`);
    const suffix = randomUUID();

    const result = await renameTag(tag.id, `  Renamed ${suffix}  `);

    expect(result).toEqual({
      id: tag.id,
      name: `Renamed ${suffix}`,
      normalizedName: `renamed ${suffix}`.toLowerCase(),
    });
  });

  it("should allow changing only the letter case of the same tag", async () => {
    const suffix = randomUUID();
    const tag = await resolveOrCreateTag(`case-${suffix}`);

    const result = await renameTag(tag.id, `CASE-${suffix}`);

    expect(result).toMatchObject({ id: tag.id, name: `CASE-${suffix}` });
  });

  it("should refuse a name another tag already has, ignoring case", async () => {
    const suffix = randomUUID();
    const other = await resolveOrCreateTag(`taken-${suffix}`);
    const tag = await resolveOrCreateTag(`mine-${suffix}`);

    const result = await renameTag(tag.id, `TAKEN-${suffix}`);

    expect(result).toEqual({ error: "name_taken" });
    expect((await getTag(tag.id))?.name).toBe(`mine-${suffix}`);
    expect((await getTag(other.id))?.name).toBe(`taken-${suffix}`);
  });

  it("should report not_found for an unknown tag", async () => {
    expect(await renameTag("missing", "anything")).toEqual({ error: "not_found" });
  });
});

describe("deleteTag (real Postgres)", () => {
  it("should remove the tag and all of its assignments, leaving other tags alone", async () => {
    const tag = await resolveOrCreateTag(`doomed-${randomUUID()}`);
    const survivor = await resolveOrCreateTag(`survivor-${randomUUID()}`);

    await assignTag(tag.id, "topic", id("topic"));
    await assignTag(tag.id, "topic", id("topic"));
    await assignTag(survivor.id, "topic", id("topic"));

    expect(await deleteTag(tag.id)).toBe(true);

    const gone = await client.query(`SELECT 1 FROM tag_assignments WHERE tag_id = $1`, [tag.id]);
    const kept = await client.query(`SELECT 1 FROM tag_assignments WHERE tag_id = $1`, [
      survivor.id,
    ]);

    expect(await getTag(tag.id)).toBeNull();
    expect(gone.rows).toHaveLength(0);
    expect(kept.rows).toHaveLength(1);
  });

  it("should return false for an unknown tag", async () => {
    expect(await deleteTag("missing")).toBe(false);
  });
});
