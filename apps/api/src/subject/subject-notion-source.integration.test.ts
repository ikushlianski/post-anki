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

const dbName = `subj_notion_${randomUUID().replace(/-/g, "_")}`;
const testUrl = new URL(BASE_DATABASE_URL);

testUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: testUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = testUrl.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { deleteSubject, mergeSubjects } = await import("./subject.repo.js");
const { SubjectHasNotionSourcesError } = await import("./subject-notion-sources.error.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: testUrl.toString() });
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

async function insertSubject(name: string): Promise<string> {
  const id = `sub_nsrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );

  return id;
}

async function insertNotionSource(subjectId: string): Promise<string> {
  const id = `nis_${randomUUID()}`;
  const pageId = randomUUID().replace(/-/g, "");

  await client.query(
    `INSERT INTO notion_ingestion_sources (id, name, page_id, page_url, subject_id, items_per_run, frequency)
     VALUES ($1, 'Phrases', $2, $3, $4, 10, 'manual')`,
    [id, pageId, `https://www.notion.so/P-${pageId}`, subjectId],
  );

  return id;
}

async function subjectOfNotionSource(id: string): Promise<string | undefined> {
  const result = await client.query<{ subject_id: string }>(
    `SELECT subject_id FROM notion_ingestion_sources WHERE id = $1`,
    [id],
  );

  return result.rows[0]?.subject_id;
}

describe("subjects that own a Notion source", () => {
  it("should move the Notion source to the surviving subject when two subjects merge", async () => {
    const sourceId = await insertSubject("Notion Merge Source");
    const targetId = await insertSubject("Notion Merge Target");
    const notionId = await insertNotionSource(sourceId);

    const result = await mergeSubjects(targetId, sourceId);

    expect("error" in result).toBe(false);
    expect(await subjectOfNotionSource(notionId)).toBe(targetId);
  });

  it("should refuse to delete a subject that still has a Notion source and keep both rows", async () => {
    const subjectId = await insertSubject("Notion Delete Blocked");
    const notionId = await insertNotionSource(subjectId);

    await expect(deleteSubject(subjectId)).rejects.toBeInstanceOf(SubjectHasNotionSourcesError);
    expect(await subjectOfNotionSource(notionId)).toBe(subjectId);
  });

  it("should delete a subject once its Notion source is gone", async () => {
    const subjectId = await insertSubject("Notion Delete Allowed");
    const notionId = await insertNotionSource(subjectId);

    await client.query(`DELETE FROM notion_ingestion_sources WHERE id = $1`, [notionId]);

    expect(await deleteSubject(subjectId)).toBe(true);
  });
});
