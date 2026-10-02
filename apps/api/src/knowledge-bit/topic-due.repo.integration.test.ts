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

const { listTopicsWithDueCounts, getDueCountsForTopics, getDueCountsForModules } = await import(
  "./topic-due.repo.js"
);
const { getCurriculumDetail } = await import("../curriculum/curriculum.repo.js");

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
  included?: boolean;
  learningStatus?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, learning_status)
     VALUES ($1, $2, $3, $4, 1, $5, $6)`,
    [
      overrides.id,
      overrides.moduleId,
      overrides.curriculumId,
      overrides.title,
      overrides.included ?? true,
      overrides.learningStatus ?? "not_started",
    ],
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

async function insertGap(overrides: {
  id: string;
  topicId: string;
  label: string;
  state: "open" | "covered" | "skipped";
}): Promise<void> {
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state) VALUES ($1, $2, $3, $4)`,
    [overrides.id, overrides.topicId, overrides.label, overrides.state],
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

  it("omits a topic the learner deliberately dropped, even with overdue bits", async () => {
    await insertSubject({ id: "sub_due_dropped", name: "Testing dropped" });
    await insertCurriculum({ id: "cur_due_dropped", subjectId: "sub_due_dropped", name: "Scheduling dropped" });
    await insertModule({ id: "mod_due_dropped", curriculumId: "cur_due_dropped", title: "Reviews dropped" });
    await insertTopic({
      id: "top_due_dropped",
      moduleId: "mod_due_dropped",
      curriculumId: "cur_due_dropped",
      title: "Deliberately dropped",
      included: false,
      learningStatus: "skipping",
    });
    await insertKnowledgeBit({
      id: "bit_due_dropped",
      knowledgeSourceId: "src_due_dropped",
      ordinal: 1,
      body: "Was due yesterday but the topic was dropped",
      topicId: "top_due_dropped",
    });
    await insertQuestionVariant({ id: "qv_due_dropped", knowledgeBitId: "bit_due_dropped" });
    await insertSchedule({
      knowledgeBitId: "bit_due_dropped",
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const ranked = await listTopicsWithDueCounts(50);

    expect(ranked.find((row) => row.topicId === "top_due_dropped")).toBeUndefined();
  });
});

describe("getDueCountsForModules", () => {
  it("sums due bits across two topics in one module", async () => {
    await insertSubject({ id: "sub_due_4", name: "Testing 4" });
    await insertCurriculum({ id: "cur_due_4", subjectId: "sub_due_4", name: "Scheduling 4" });
    await insertModule({ id: "mod_due_4a", curriculumId: "cur_due_4", title: "Reviews 4a" });
    await insertModule({ id: "mod_due_4b", curriculumId: "cur_due_4", title: "Reviews 4b" });
    await insertTopic({
      id: "top_due_4a1",
      moduleId: "mod_due_4a",
      curriculumId: "cur_due_4",
      title: "Topic 4a1",
    });
    await insertTopic({
      id: "top_due_4a2",
      moduleId: "mod_due_4a",
      curriculumId: "cur_due_4",
      title: "Topic 4a2",
    });
    await insertTopic({
      id: "top_due_4b1",
      moduleId: "mod_due_4b",
      curriculumId: "cur_due_4",
      title: "Topic 4b1",
    });

    await insertKnowledgeBit({
      id: "bit_due_4a1",
      knowledgeSourceId: "src_due_4",
      ordinal: 1,
      body: "Never reviewed yet",
      topicId: "top_due_4a1",
    });
    await insertKnowledgeBit({
      id: "bit_due_4a2",
      knowledgeSourceId: "src_due_4",
      ordinal: 2,
      body: "Never reviewed yet either",
      topicId: "top_due_4a2",
    });
    await insertKnowledgeBit({
      id: "bit_due_4b1",
      knowledgeSourceId: "src_due_4",
      ordinal: 3,
      body: "Never reviewed yet as well",
      topicId: "top_due_4b1",
    });

    await insertQuestionVariant({ id: "qv_due_4a1", knowledgeBitId: "bit_due_4a1" });
    await insertQuestionVariant({ id: "qv_due_4a2", knowledgeBitId: "bit_due_4a2" });
    await insertQuestionVariant({ id: "qv_due_4b1", knowledgeBitId: "bit_due_4b1" });

    const moduleDue = await getDueCountsForModules(["mod_due_4a", "mod_due_4b"]);

    expect(moduleDue.get("mod_due_4a")).toBe(2);
    expect(moduleDue.get("mod_due_4b")).toBe(1);
  });

  it("excludes a module whose only bit is due in the future, and a bit with no generated question variant", async () => {
    await insertSubject({ id: "sub_due_5", name: "Testing 5" });
    await insertCurriculum({ id: "cur_due_5", subjectId: "sub_due_5", name: "Scheduling 5" });
    await insertModule({ id: "mod_due_5", curriculumId: "cur_due_5", title: "Reviews 5" });
    await insertTopic({
      id: "top_due_5_future",
      moduleId: "mod_due_5",
      curriculumId: "cur_due_5",
      title: "Not due for a while",
    });
    await insertTopic({
      id: "top_due_5_ungenerated",
      moduleId: "mod_due_5",
      curriculumId: "cur_due_5",
      title: "Still generating",
    });

    await insertKnowledgeBit({
      id: "bit_due_5_future",
      knowledgeSourceId: "src_due_5",
      ordinal: 1,
      body: "Reviewed and not due for a while",
      topicId: "top_due_5_future",
    });
    await insertQuestionVariant({ id: "qv_due_5_future", knowledgeBitId: "bit_due_5_future" });
    await insertSchedule({
      knowledgeBitId: "bit_due_5_future",
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    await insertKnowledgeBit({
      id: "bit_due_5_ungenerated",
      knowledgeSourceId: "src_due_5",
      ordinal: 2,
      body: "Placed but never generated a question",
      topicId: "top_due_5_ungenerated",
    });

    const moduleDue = await getDueCountsForModules(["mod_due_5"]);

    expect(moduleDue.get("mod_due_5")).toBeUndefined();
  });

  it("excludes a topic excluded from the active plan (included = false) from the module's due count", async () => {
    await insertSubject({ id: "sub_due_6", name: "Testing 6" });
    await insertCurriculum({ id: "cur_due_6", subjectId: "sub_due_6", name: "Scheduling 6" });
    await insertModule({ id: "mod_due_6", curriculumId: "cur_due_6", title: "Reviews 6" });
    await insertTopic({
      id: "top_due_6_included",
      moduleId: "mod_due_6",
      curriculumId: "cur_due_6",
      title: "Kept in the plan",
      included: true,
    });
    await insertTopic({
      id: "top_due_6_excluded",
      moduleId: "mod_due_6",
      curriculumId: "cur_due_6",
      title: "Dropped from the plan",
      included: false,
    });

    await insertKnowledgeBit({
      id: "bit_due_6_included",
      knowledgeSourceId: "src_due_6",
      ordinal: 1,
      body: "Never reviewed yet",
      topicId: "top_due_6_included",
    });
    await insertKnowledgeBit({
      id: "bit_due_6_excluded",
      knowledgeSourceId: "src_due_6",
      ordinal: 2,
      body: "Never reviewed yet either",
      topicId: "top_due_6_excluded",
    });
    await insertQuestionVariant({ id: "qv_due_6_included", knowledgeBitId: "bit_due_6_included" });
    await insertQuestionVariant({ id: "qv_due_6_excluded", knowledgeBitId: "bit_due_6_excluded" });

    const moduleDue = await getDueCountsForModules(["mod_due_6"]);

    expect(moduleDue.get("mod_due_6")).toBe(1);
  });
});

describe("getCurriculumDetail dueCount", () => {
  it("scopes the module dueCount to included topics, and sums the curriculum dueCount from the modules", async () => {
    await insertSubject({ id: "sub_due_7", name: "Testing 7" });
    await insertCurriculum({ id: "cur_due_7", subjectId: "sub_due_7", name: "Scheduling 7" });
    await insertModule({ id: "mod_due_7a", curriculumId: "cur_due_7", title: "Reviews 7a" });
    await insertModule({ id: "mod_due_7b", curriculumId: "cur_due_7", title: "Reviews 7b" });
    await insertTopic({
      id: "top_due_7a_included",
      moduleId: "mod_due_7a",
      curriculumId: "cur_due_7",
      title: "Kept in the plan",
      included: true,
    });
    await insertTopic({
      id: "top_due_7a_excluded",
      moduleId: "mod_due_7a",
      curriculumId: "cur_due_7",
      title: "Dropped from the plan",
      included: false,
    });
    await insertTopic({
      id: "top_due_7b1",
      moduleId: "mod_due_7b",
      curriculumId: "cur_due_7",
      title: "Topic 7b1",
    });

    await insertKnowledgeBit({
      id: "bit_due_7a_included",
      knowledgeSourceId: "src_due_7",
      ordinal: 1,
      body: "Never reviewed yet",
      topicId: "top_due_7a_included",
    });
    await insertKnowledgeBit({
      id: "bit_due_7a_excluded",
      knowledgeSourceId: "src_due_7",
      ordinal: 2,
      body: "Never reviewed yet either",
      topicId: "top_due_7a_excluded",
    });
    await insertKnowledgeBit({
      id: "bit_due_7b1",
      knowledgeSourceId: "src_due_7",
      ordinal: 3,
      body: "Never reviewed yet as well",
      topicId: "top_due_7b1",
    });

    await insertQuestionVariant({ id: "qv_due_7a_included", knowledgeBitId: "bit_due_7a_included" });
    await insertQuestionVariant({ id: "qv_due_7a_excluded", knowledgeBitId: "bit_due_7a_excluded" });
    await insertQuestionVariant({ id: "qv_due_7b1", knowledgeBitId: "bit_due_7b1" });

    const detail = await getCurriculumDetail("cur_due_7");

    const moduleA = detail?.modules.find((m) => m.id === "mod_due_7a");
    const moduleB = detail?.modules.find((m) => m.id === "mod_due_7b");

    expect(moduleA?.dueCount).toBe(1);
    expect(moduleB?.dueCount).toBe(1);
    expect(detail?.dueCount).toBe(2);
  });
});

describe("listTopicsWithDueCounts cross-subject ranking", () => {
  it("ranks a topic with an older overdue bit above one with a newer overdue bit, even with fewer due bits", async () => {
    await insertSubject({ id: "sub_due_8", name: "Testing 8" });
    await insertCurriculum({ id: "cur_due_8", subjectId: "sub_due_8", name: "Scheduling 8" });
    await insertModule({ id: "mod_due_8", curriculumId: "cur_due_8", title: "Reviews 8" });

    await insertTopic({
      id: "top_due_8_old",
      moduleId: "mod_due_8",
      curriculumId: "cur_due_8",
      title: "Long overdue",
    });
    await insertTopic({
      id: "top_due_8_new",
      moduleId: "mod_due_8",
      curriculumId: "cur_due_8",
      title: "Recently overdue",
    });

    await insertKnowledgeBit({
      id: "bit_due_8_old",
      knowledgeSourceId: "src_due_8",
      ordinal: 1,
      body: "Waiting ten days",
      topicId: "top_due_8_old",
    });

    await insertKnowledgeBit({
      id: "bit_due_8_new_1",
      knowledgeSourceId: "src_due_8",
      ordinal: 2,
      body: "Waiting one day, bit one",
      topicId: "top_due_8_new",
    });
    await insertKnowledgeBit({
      id: "bit_due_8_new_2",
      knowledgeSourceId: "src_due_8",
      ordinal: 3,
      body: "Waiting one day, bit two",
      topicId: "top_due_8_new",
    });
    await insertKnowledgeBit({
      id: "bit_due_8_new_3",
      knowledgeSourceId: "src_due_8",
      ordinal: 4,
      body: "Waiting one day, bit three",
      topicId: "top_due_8_new",
    });

    await insertQuestionVariant({ id: "qv_due_8_old", knowledgeBitId: "bit_due_8_old" });
    await insertQuestionVariant({ id: "qv_due_8_new_1", knowledgeBitId: "bit_due_8_new_1" });
    await insertQuestionVariant({ id: "qv_due_8_new_2", knowledgeBitId: "bit_due_8_new_2" });
    await insertQuestionVariant({ id: "qv_due_8_new_3", knowledgeBitId: "bit_due_8_new_3" });

    await insertSchedule({
      knowledgeBitId: "bit_due_8_old",
      dueAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    await insertSchedule({
      knowledgeBitId: "bit_due_8_new_1",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    await insertSchedule({
      knowledgeBitId: "bit_due_8_new_2",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    await insertSchedule({
      knowledgeBitId: "bit_due_8_new_3",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    const ranked = await listTopicsWithDueCounts(50);

    const oldIndex = ranked.findIndex((row) => row.topicId === "top_due_8_old");
    const newIndex = ranked.findIndex((row) => row.topicId === "top_due_8_new");

    expect(oldIndex).toBeGreaterThanOrEqual(0);
    expect(newIndex).toBeGreaterThanOrEqual(0);
    expect(oldIndex).toBeLessThan(newIndex);
  });

  it("ranks the topic with more open gaps first among topics with the same oldestDueAt", async () => {
    await insertSubject({ id: "sub_due_9", name: "Testing 9" });
    await insertCurriculum({ id: "cur_due_9", subjectId: "sub_due_9", name: "Scheduling 9" });
    await insertModule({ id: "mod_due_9", curriculumId: "cur_due_9", title: "Reviews 9" });

    await insertTopic({
      id: "top_due_9_more_gaps",
      moduleId: "mod_due_9",
      curriculumId: "cur_due_9",
      title: "More open gaps",
    });
    await insertTopic({
      id: "top_due_9_fewer_gaps",
      moduleId: "mod_due_9",
      curriculumId: "cur_due_9",
      title: "Fewer open gaps",
    });

    const sharedDueAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await insertKnowledgeBit({
      id: "bit_due_9_more_gaps",
      knowledgeSourceId: "src_due_9",
      ordinal: 1,
      body: "Topic with more open gaps",
      topicId: "top_due_9_more_gaps",
    });
    await insertKnowledgeBit({
      id: "bit_due_9_fewer_gaps_1",
      knowledgeSourceId: "src_due_9",
      ordinal: 2,
      body: "Topic with fewer open gaps, bit one",
      topicId: "top_due_9_fewer_gaps",
    });
    await insertKnowledgeBit({
      id: "bit_due_9_fewer_gaps_2",
      knowledgeSourceId: "src_due_9",
      ordinal: 3,
      body: "Topic with fewer open gaps, bit two",
      topicId: "top_due_9_fewer_gaps",
    });

    await insertQuestionVariant({ id: "qv_due_9_more_gaps", knowledgeBitId: "bit_due_9_more_gaps" });
    await insertQuestionVariant({
      id: "qv_due_9_fewer_gaps_1",
      knowledgeBitId: "bit_due_9_fewer_gaps_1",
    });
    await insertQuestionVariant({
      id: "qv_due_9_fewer_gaps_2",
      knowledgeBitId: "bit_due_9_fewer_gaps_2",
    });

    await insertSchedule({ knowledgeBitId: "bit_due_9_more_gaps", dueAt: sharedDueAt });
    await insertSchedule({ knowledgeBitId: "bit_due_9_fewer_gaps_1", dueAt: sharedDueAt });
    await insertSchedule({ knowledgeBitId: "bit_due_9_fewer_gaps_2", dueAt: sharedDueAt });

    await insertGap({
      id: "gap_due_9_open_1",
      topicId: "top_due_9_more_gaps",
      label: "Open gap one",
      state: "open",
    });
    await insertGap({
      id: "gap_due_9_open_2",
      topicId: "top_due_9_more_gaps",
      label: "Open gap two",
      state: "open",
    });
    await insertGap({
      id: "gap_due_9_covered",
      topicId: "top_due_9_fewer_gaps",
      label: "Covered gap",
      state: "covered",
    });
    await insertGap({
      id: "gap_due_9_skipped",
      topicId: "top_due_9_fewer_gaps",
      label: "Skipped gap",
      state: "skipped",
    });

    const ranked = await listTopicsWithDueCounts(50);

    const moreGapsIndex = ranked.findIndex((row) => row.topicId === "top_due_9_more_gaps");
    const fewerGapsIndex = ranked.findIndex((row) => row.topicId === "top_due_9_fewer_gaps");

    expect(moreGapsIndex).toBeGreaterThanOrEqual(0);
    expect(fewerGapsIndex).toBeGreaterThanOrEqual(0);
    expect(moreGapsIndex).toBeLessThan(fewerGapsIndex);
  });
});
