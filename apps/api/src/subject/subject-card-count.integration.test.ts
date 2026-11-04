import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subj_cardcount_${randomUUID().replace(/-/g, "_")}`;
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

const { listSubjects } = await import("./subject.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

beforeEach(async () => {
  await client.query(
    "TRUNCATE subjects, knowledge_sources, knowledge_bits, knowledge_bit_question_variants, curricula, modules, topics CASCADE",
  );
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

async function insertSubject(name: string, parentId: string | null = null): Promise<string> {
  const id = `sub_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind, parent_id) VALUES ($1, $2, false, 'architecture-mentor', $3)`,
    [id, name, parentId],
  );

  return id;
}

async function insertSource(subjectId: string | null): Promise<string> {
  const id = `src_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'text', 'raw', $2)`,
    [id, subjectId],
  );

  return id;
}

async function insertCurriculum(subjectId: string): Promise<string> {
  const id = `cur_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, 'Curriculum')`, [
    id,
    subjectId,
  ]);

  return id;
}

async function insertTopic(curriculumId: string): Promise<string> {
  const moduleId = `mod_${randomUUID()}`;
  const topicId = `top_${randomUUID()}`;

  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`, [
    moduleId,
    curriculumId,
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'Topic', 0)`,
    [topicId, moduleId, curriculumId],
  );

  return topicId;
}

async function insertBit(
  sourceId: string,
  ordinal: number,
  approvalState: string,
  topicId: string | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, topic_id)
     VALUES ($1, $2, $3, 'body', $4, $5)`,
    [id, sourceId, ordinal, approvalState, topicId],
  );

  return id;
}

async function insertVariant(bitId: string, superseded: boolean): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
     VALUES ($1, $2, 'basic', 0, 'Q?', 'A.', CASE WHEN $3 THEN now() ELSE NULL END)`,
    [`qv_${randomUUID()}`, bitId, superseded],
  );
}

async function insertApprovedBitWithVariant(sourceId: string, ordinal: number): Promise<string> {
  const bitId = await insertBit(sourceId, ordinal, "approved");

  await insertVariant(bitId, false);

  return bitId;
}

async function countsById(): Promise<(id: string) => number | undefined> {
  const subjects = await listSubjects();

  return (id: string) => subjects.find((subject) => subject.id === id)?.cardCount;
}

describe("listSubjects card counts", () => {
  it("should count only approved cards per subject and report zero for empty subjects", async () => {
    const sales = await insertSubject("Sales");
    const empty = await insertSubject("Empty");
    const salesSource = await insertSource(sales);
    const unfiled = await insertSource(null);

    await insertApprovedBitWithVariant(salesSource, 0);
    await insertApprovedBitWithVariant(salesSource, 1);
    await insertBit(salesSource, 2, "pending");
    await insertBit(salesSource, 3, "rejected");
    await insertApprovedBitWithVariant(unfiled, 0);

    const countOf = await countsById();

    expect(countOf(sales)).toBe(2);
    expect(countOf(empty)).toBe(0);
  });

  it("should count a bit placed in a topic toward its curriculum subject", async () => {
    const sales = await insertSubject("Sales");
    const unfiled = await insertSource(null);
    const curriculumId = await insertCurriculum(sales);
    const topicId = await insertTopic(curriculumId);
    const placedBit = await insertBit(unfiled, 0, "approved", topicId);

    await insertVariant(placedBit, false);

    const countOf = await countsById();

    expect(countOf(sales)).toBe(1);
  });

  it("should not count an approved bit that has no active variant", async () => {
    const sales = await insertSubject("Sales");
    const salesSource = await insertSource(sales);

    await insertBit(salesSource, 0, "approved");

    const supersededOnly = await insertBit(salesSource, 1, "approved");

    await insertVariant(supersededOnly, true);

    await insertApprovedBitWithVariant(salesSource, 2);

    const countOf = await countsById();

    expect(countOf(sales)).toBe(1);
  });

  it("should include descendant cards in each ancestor's count through a grandchild", async () => {
    const parent = await insertSubject("Engineering");
    const child = await insertSubject("Backend", parent);
    const grandchild = await insertSubject("Databases", child);
    const sibling = await insertSubject("Design");

    await insertApprovedBitWithVariant(await insertSource(parent), 0);
    await insertApprovedBitWithVariant(await insertSource(child), 0);
    await insertApprovedBitWithVariant(await insertSource(child), 1);
    await insertApprovedBitWithVariant(await insertSource(grandchild), 0);
    await insertApprovedBitWithVariant(await insertSource(sibling), 0);

    const countOf = await countsById();

    expect(countOf(grandchild)).toBe(1);
    expect(countOf(child)).toBe(3);
    expect(countOf(parent)).toBe(4);
    expect(countOf(sibling)).toBe(1);
  });

  it("should count a descendant card once per ancestor with several children and ignore unapproved cards", async () => {
    const parent = await insertSubject("Engineering");
    const childA = await insertSubject("Backend", parent);
    const childB = await insertSubject("Frontend", parent);
    const sourceA = await insertSource(childA);

    await insertApprovedBitWithVariant(sourceA, 0);
    await insertBit(sourceA, 1, "pending");
    await insertApprovedBitWithVariant(await insertSource(childB), 0);

    const countOf = await countsById();

    expect(countOf(childA)).toBe(1);
    expect(countOf(childB)).toBe(1);
    expect(countOf(parent)).toBe(2);
  });
});
