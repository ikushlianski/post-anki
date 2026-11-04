import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subject_creation_${randomUUID().replace(/-/g, "_")}`;
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

const { createSubjectUnlessDuplicate } = await import("./subject-creation.repo.js");
const { recordSubjectSuggestion } = await import("./subject-assignment.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO subjects (id, name, parent_id, kind) VALUES
      ('sub_eng', 'Engineering', NULL, 'architecture-mentor'),
      ('sub_db', 'Databases', 'sub_eng', 'architecture-mentor'),
      ('sub_deep', 'Replication', 'sub_db', 'architecture-mentor')`,
  );
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ('src_new', 'prose', 'graph theory', 'bits_detected')`,
  );
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

describe("automatic subject creation", () => {
  it("should create the subject under its parent and only suggest it on the source", async () => {
    const subjectId = await createSubjectUnlessDuplicate({ name: "Graph Theory", parentId: "sub_eng", languageHint: false });

    expect(subjectId).not.toBeNull();

    await recordSubjectSuggestion("src_new", { subjectId: subjectId!, confidence: "medium" });

    const subject = await client.query(`SELECT name, parent_id, kind FROM subjects WHERE id = $1`, [subjectId]);
    const source = await client.query(
      `SELECT subject_id, suggested_subject_id, suggested_subject_confidence FROM knowledge_sources WHERE id = 'src_new'`,
    );

    expect(subject.rows[0]).toEqual({ name: "Graph Theory", parent_id: "sub_eng", kind: "architecture-mentor" });
    expect(source.rows[0]).toEqual({
      subject_id: null,
      suggested_subject_id: subjectId,
      suggested_subject_confidence: "medium",
    });
  });

  it("should not create a second subject whose name already exists or nearly matches", async () => {
    expect(await createSubjectUnlessDuplicate({ name: "graph theory", parentId: "sub_db", languageHint: false })).toBeNull();
    expect(await createSubjectUnlessDuplicate({ name: "Databasez", parentId: null, languageHint: false })).toBeNull();

    const { rows } = await client.query(`SELECT count(*)::int AS total FROM subjects`);

    expect(rows[0].total).toBe(4);
  });

  it("should refuse to nest a new subject below the maximum depth", async () => {
    expect(await createSubjectUnlessDuplicate({ name: "Quorum Reads", parentId: "sub_deep", languageHint: false })).toBeNull();
  });

  it("should refuse a parent that does not exist", async () => {
    expect(await createSubjectUnlessDuplicate({ name: "Quorum Reads", parentId: "sub_missing", languageHint: false })).toBeNull();
  });
});
