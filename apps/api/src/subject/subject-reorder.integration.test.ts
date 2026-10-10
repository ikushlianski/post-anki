import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Real Postgres, never mocked. DATABASE_URL has no fallback: the reorder must run
// against a database the developer names explicitly, and the target is asserted
// local-only before anything connects.
const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subj_reorder_${randomUUID().replace(/-/g, "_")}`;
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

const { reorderSubjects } = await import("./subject.repo.js");

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

async function sortOrderOf(id: string): Promise<number | null> {
  const result = await client.query<{ sort_order: number | null }>(
    "SELECT sort_order FROM subjects WHERE id = $1",
    [id],
  );

  return result.rows[0]?.sort_order ?? null;
}

describe("reorderSubjects", () => {
  it("should rewrite positions to 0..n-1 for the chosen sibling group only", async () => {
    const parentId = await insertSubject("Programming");
    const first = await insertSubject("Web", parentId, 5);
    const second = await insertSubject("Databases", parentId, 9);
    const third = await insertSubject("AI", parentId, null);
    const outsider = await insertSubject("Business", null, 7);

    const result = await reorderSubjects(parentId, [third, first, second]);

    expect(result).toEqual({ reordered: 3 });
    expect(await sortOrderOf(third)).toBe(0);
    expect(await sortOrderOf(first)).toBe(1);
    expect(await sortOrderOf(second)).toBe(2);
    expect(await sortOrderOf(outsider)).toBe(7);
  });

  it("should treat a null parent as the top-level group and leave nested subjects alone", async () => {
    const alpha = await insertSubject("Alpha", null, null);
    const beta = await insertSubject("Beta", null, null);
    const parentId = await insertSubject("Parent", null, null);
    const child = await insertSubject("Child", parentId, 4);

    const result = await reorderSubjects(null, [beta, alpha, parentId]);

    expect(result).toEqual({ reordered: 3 });
    expect(await sortOrderOf(beta)).toBe(0);
    expect(await sortOrderOf(alpha)).toBe(1);
    expect(await sortOrderOf(parentId)).toBe(2);
    expect(await sortOrderOf(child)).toBe(4);
  });

  it("should reject a missing, extra, duplicate or other-parent id without changing any row", async () => {
    const parentId = await insertSubject("Programming", null, null);
    const first = await insertSubject("Web", parentId, 0);
    const second = await insertSubject("Databases", parentId, 1);
    const otherParent = await insertSubject("Business", null, null);
    const stranger = await insertSubject("Stranger", otherParent, 0);

    const missing = await reorderSubjects(parentId, [first]);
    const extra = await reorderSubjects(parentId, [first, second, stranger]);
    const duplicate = await reorderSubjects(parentId, [first, first]);
    const wrongGroup = await reorderSubjects(parentId, [first, stranger]);

    expect(missing).toEqual({ error: "invalid_id_set" });
    expect(extra).toEqual({ error: "invalid_id_set" });
    expect(duplicate).toEqual({ error: "invalid_id_set" });
    expect(wrongGroup).toEqual({ error: "invalid_id_set" });
    expect(await sortOrderOf(first)).toBe(0);
    expect(await sortOrderOf(second)).toBe(1);
    expect(await sortOrderOf(stranger)).toBe(0);
  });

  it("should return parent_not_found for a parent that does not exist", async () => {
    const orphan = await insertSubject("Orphan", null, null);

    const result = await reorderSubjects(`sub_${randomUUID()}`, [orphan]);

    expect(result).toEqual({ error: "parent_not_found" });
    expect(await sortOrderOf(orphan)).toBeNull();
  });
});
