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

const dbName = `mcp_manual_source_${randomUUID().replace(/-/g, "_")}`;
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

const { getOrCreateManualCardSource, manualCardSourceKey } = await import("./manual-card-source.repo.js");
const { resolveSubjectForWrite, findExistingSubject } = await import("./subject-ref.js");

async function seedSubject(name: string, parentId: string | null = null): Promise<string> {
  const subjectId = `sub_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, kind, parent_id) VALUES ($1, $2, 'architecture-mentor', $3)`, [
    subjectId,
    name,
    parentId,
  ]);

  return subjectId;
}

describe("MCP manual card source against a real database", () => {
  it("should create one manual source per subject and return the same one on repeat calls", async () => {
    const subjectId = await seedSubject("Manual A");
    const first = await getOrCreateManualCardSource(subjectId);
    const second = await getOrCreateManualCardSource(subjectId);
    const { rows } = await client.query(`SELECT id, subject_id FROM knowledge_sources WHERE import_key = $1`, [
      manualCardSourceKey(subjectId),
    ]);

    expect(second).toBe(first);
    expect(rows).toEqual([{ id: first, subject_id: subjectId }]);
  });

  it("should give different subjects different manual sources", async () => {
    const a = await getOrCreateManualCardSource(await seedSubject("Manual B"));
    const b = await getOrCreateManualCardSource(await seedSubject("Manual C"));

    expect(a).not.toBe(b);
  });

  it("should not create duplicates when two cards are added at the same time", async () => {
    const subjectId = await seedSubject("Manual D");
    const ids = await Promise.all([1, 2, 3].map(() => getOrCreateManualCardSource(subjectId)));
    const { rows } = await client.query(`SELECT 1 FROM knowledge_sources WHERE subject_id = $1`, [subjectId]);

    expect(new Set(ids).size).toBe(1);
    expect(rows).toHaveLength(1);
  });
});

describe("MCP subject lookup against a real database", () => {
  it("should find an existing subject by id and by case-insensitive path without creating anything", async () => {
    const rootId = await seedSubject("Lookup Root");
    const childId = await seedSubject("Child Topic", rootId);
    const before = await client.query(`SELECT count(*)::int AS n FROM subjects`);

    expect(await findExistingSubject(rootId)).toEqual({ subjectId: rootId, subjectPath: "Lookup Root" });
    expect(await findExistingSubject("Lookup Root/child topic")).toEqual({
      subjectId: childId,
      subjectPath: "Lookup Root/child topic",
    });

    const after = await client.query(`SELECT count(*)::int AS n FROM subjects`);

    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("should report not_found for a missing path and invalid_path for a malformed one", async () => {
    expect(await findExistingSubject("No Such Root/Child")).toEqual({ error: "not_found" });
    expect(await findExistingSubject("A/B/C/D/E")).toEqual({ error: "invalid_path" });
  });

  it("should create a missing subject path for writes and reuse it afterwards", async () => {
    const first = await resolveSubjectForWrite("Write Root/Write Child");
    const second = await resolveSubjectForWrite("Write Root/Write Child");

    expect(first).not.toHaveProperty("error");
    expect(second).toEqual(first);
  });

  it("should resolve a plain subject id for writes", async () => {
    const subjectId = await seedSubject("Write By Id");

    expect(await resolveSubjectForWrite(subjectId)).toEqual({ subjectId, subjectPath: "Write By Id" });
  });
});
