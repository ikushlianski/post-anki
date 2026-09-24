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

const dbName = `topic_due_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { listTopicsWithDueCounts, getDueCountsForTopics } = await import("./topic-due.repo.js");

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

async function insertSubject(overrides: { id: string; name: string }): Promise<void> {
  await client.query(`INSERT INTO subjects (id, name, require_sources) VALUES ($1, $2, false)`, [
    overrides.id,
    overrides.name,
  ]);
}

async function insertCurriculum(overrides: {
  id: string;
  subjectId: string;
  name: string;
}): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    overrides.id,
    overrides.subjectId,
    overrides.name,
  ]);
}

async function insertModule(overrides: { id: string; curriculumId: string; title: string }): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    overrides.id,
    overrides.curriculumId,
    overrides.title,
  ]);
}

async function insertTopic(overrides: {
  id: string;
  moduleId: string;
  curriculumId: string;
  title: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [overrides.id, overrides.moduleId, overrides.curriculumId, overrides.title],
  );
}

async function insertKnowledgeBit(overrides: {
  id: string;
  knowledgeSourceId: string;
  ordinal: number;
  body: string;
  topicId: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id) VALUES ($1, $2, $3, $4, $5)`,
    [overrides.id, overrides.knowledgeSourceId, overrides.ordinal, overrides.body, overrides.topicId],
  );
}

async function insertSchedule(overrides: { knowledgeBitId: string; dueAt: Date }): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at) VALUES ($1, $2)`,
    [overrides.knowledgeBitId, overrides.dueAt.toISOString()],
  );
}

async function insertQuestionVariant(overrides: { id: string; knowledgeBitId: string }): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'A prompt?', 'An answer')`,
    [overrides.id, overrides.knowledgeBitId],
  );
}

describe("listTopicsWithDueCounts / getDueCountsForTopics", () => {
  it("counts a never-reviewed bit as due, and an overdue bit, but not a bit due in the future", async () => {
    await insertSubject({ id: "sub_due_1", name: "Testing" });
    await insertCurriculum({ id: "cur_due_1", subjectId: "sub_due_1", name: "Scheduling" });
    await insertModule({ id: "mod_due_1", curriculumId: "cur_due_1", title: "Reviews" });
    await insertTopic({
      id: "top_due_1",
      moduleId: "mod_due_1",
      curriculumId: "cur_due_1",
      title: "Interval growth",
    });

    await insertKnowledgeBit({
      id: "bit_due_new",
      knowledgeSourceId: "src_due_1",
      ordinal: 1,
      body: "Never reviewed yet",
      topicId: "top_due_1",
    });
    await insertKnowledgeBit({
      id: "bit_due_overdue",
      knowledgeSourceId: "src_due_1",
      ordinal: 2,
      body: "Was due yesterday",
      topicId: "top_due_1",
    });
    await insertKnowledgeBit({
      id: "bit_due_future",
      knowledgeSourceId: "src_due_1",
      ordinal: 3,
      body: "Not due for another month",
      topicId: "top_due_1",
    });

    await insertQuestionVariant({ id: "qv_due_new", knowledgeBitId: "bit_due_new" });
    await insertQuestionVariant({ id: "qv_due_overdue", knowledgeBitId: "bit_due_overdue" });
    await insertQuestionVariant({ id: "qv_due_future", knowledgeBitId: "bit_due_future" });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await insertSchedule({ knowledgeBitId: "bit_due_overdue", dueAt: yesterday });
    await insertSchedule({ knowledgeBitId: "bit_due_future", dueAt: nextMonth });

    const ranked = await listTopicsWithDueCounts(10);
    const topicRow = ranked.find((row) => row.topicId === "top_due_1");

    expect(topicRow).toMatchObject({ topicId: "top_due_1", title: "Interval growth", dueCount: 2 });

    const scoped = await getDueCountsForTopics(["top_due_1"]);

    expect(scoped.get("top_due_1")).toBe(2);
  });

  it("omits a topic with no due bits from the ranked list", async () => {
    await insertSubject({ id: "sub_due_2", name: "Testing 2" });
    await insertCurriculum({ id: "cur_due_2", subjectId: "sub_due_2", name: "Scheduling 2" });
    await insertModule({ id: "mod_due_2", curriculumId: "cur_due_2", title: "Reviews 2" });
    await insertTopic({
      id: "top_due_caught_up",
      moduleId: "mod_due_2",
      curriculumId: "cur_due_2",
      title: "Fully caught up",
    });
    await insertKnowledgeBit({
      id: "bit_due_caught_up",
      knowledgeSourceId: "src_due_2",
      ordinal: 1,
      body: "Reviewed and not due for a while",
      topicId: "top_due_caught_up",
    });
    await insertSchedule({
      knowledgeBitId: "bit_due_caught_up",
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    const ranked = await listTopicsWithDueCounts(50);

    expect(ranked.find((row) => row.topicId === "top_due_caught_up")).toBeUndefined();
  });

  it("excludes a never-reviewed bit with no generated question variant from the due count", async () => {
    await insertSubject({ id: "sub_due_3", name: "Testing 3" });
    await insertCurriculum({ id: "cur_due_3", subjectId: "sub_due_3", name: "Scheduling 3" });
    await insertModule({ id: "mod_due_3", curriculumId: "cur_due_3", title: "Reviews 3" });
    await insertTopic({
      id: "top_due_ungenerated",
      moduleId: "mod_due_3",
      curriculumId: "cur_due_3",
      title: "Still generating",
    });
    await insertKnowledgeBit({
      id: "bit_due_ungenerated",
      knowledgeSourceId: "src_due_3",
      ordinal: 1,
      body: "Placed but never generated a question",
      topicId: "top_due_ungenerated",
    });

    const ranked = await listTopicsWithDueCounts(50);

    expect(ranked.find((row) => row.topicId === "top_due_ungenerated")).toBeUndefined();

    const scoped = await getDueCountsForTopics(["top_due_ungenerated"]);

    expect(scoped.get("top_due_ungenerated")).toBeUndefined();
  });
});
