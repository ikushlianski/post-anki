import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Real Postgres, never mocked. DATABASE_URL has no fallback: the delete must run
// against a database the developer names explicitly, and the target is asserted
// local-only before anything connects.
const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subj_reparent_${randomUUID().replace(/-/g, "_")}`;
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

const { deleteSubject, getSubject } = await import("./subject.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

beforeEach(async () => {
  await client.query("TRUNCATE subjects CASCADE");
});

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

async function insertSubject(
  name: string,
  parentId: string | null = null,
  sortOrder: number | null = null,
): Promise<string> {
  const id = `sub_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind, parent_id, sort_order)
     VALUES ($1, $2, false, 'architecture-mentor', $3, $4)`,
    [id, name, parentId, sortOrder],
  );

  return id;
}

async function parentOf(id: string): Promise<string | null | undefined> {
  const result = await client.query<{ parent_id: string | null }>(
    "SELECT parent_id FROM subjects WHERE id = $1",
    [id],
  );

  return result.rows[0] ? result.rows[0].parent_id : undefined;
}

async function sortOrderOf(id: string): Promise<number | null> {
  const result = await client.query<{ sort_order: number | null }>(
    "SELECT sort_order FROM subjects WHERE id = $1",
    [id],
  );

  return result.rows[0]?.sort_order ?? null;
}

describe("deleteSubject reparenting sub-subjects", () => {
  it("should move a deleted middle subject's children up to its grandparent", async () => {
    const grandparent = await insertSubject("Engineering", null, 0);
    const middle = await insertSubject("Backend", grandparent, 1);
    const first = await insertSubject("Databases", middle, 0);
    const second = await insertSubject("Queues", middle, 1);

    expect(await deleteSubject(middle)).toBe(true);

    expect(await getSubject(middle)).toBeNull();
    expect(await parentOf(first)).toBe(grandparent);
    expect(await parentOf(second)).toBe(grandparent);
  });

  it("should append the moved children after the grandparent's existing children in their own order", async () => {
    const grandparent = await insertSubject("Engineering", null, 0);
    const existing = await insertSubject("Frontend", grandparent, 0);
    const middle = await insertSubject("Backend", grandparent, 1);
    const later = await insertSubject("Queues", middle, 5);
    const earlier = await insertSubject("Databases", middle, 2);

    await deleteSubject(middle);

    expect(await sortOrderOf(existing)).toBe(0);
    expect(await sortOrderOf(earlier)).toBe(1);
    expect(await sortOrderOf(later)).toBe(2);
  });

  it("should make a deleted top-level subject's children top-level", async () => {
    const root = await insertSubject("Languages", null, null);
    const child = await insertSubject("Spanish", root, 0);
    const grandchild = await insertSubject("Verbs", child, 0);

    expect(await deleteSubject(root)).toBe(true);

    expect(await parentOf(child)).toBeNull();
    expect(await parentOf(grandchild)).toBe(child);
  });

  it("should leave the tree unchanged when a leaf subject is deleted", async () => {
    const parent = await insertSubject("Science", null, 0);
    const sibling = await insertSubject("Math", parent, 0);
    const leaf = await insertSubject("Physics", parent, 1);

    expect(await deleteSubject(leaf)).toBe(true);

    expect(await getSubject(leaf)).toBeNull();
    expect(await parentOf(sibling)).toBe(parent);
    expect(await sortOrderOf(sibling)).toBe(0);
    expect(await parentOf(parent)).toBeNull();
  });
});
