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

const dbName = `subject_due_counts_${randomUUID().replace(/-/g, "_")}`;
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

const { getSubjectReviewDueCounts } = await import("./subject-review-due-counts.repo.js");

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

const CLOCK = { tz: "UTC", now: new Date() };
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const NEXT_MONTH = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

async function insertSubject(overrides: { id: string; name: string; parentId?: string }): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, parent_id) VALUES ($1, $2, false, $3)`,
    [overrides.id, overrides.name, overrides.parentId ?? null],
  );
}

async function insertSource(overrides: { id: string; subjectId: string | null }): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [overrides.id, overrides.subjectId],
  );
}

async function insertCurriculum(overrides: { id: string; subjectId: string }): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'Curriculum', 'confirmed')`,
    [overrides.id, overrides.subjectId],
  );
}

async function insertTopic(overrides: { id: string; curriculumId: string }): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 1)`, [
    `mod_${overrides.id}`,
    overrides.curriculumId,
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, learning_status)
     VALUES ($1, $2, $3, 'Topic', 1, true, 'not_started')`,
    [overrides.id, `mod_${overrides.id}`, overrides.curriculumId],
  );
}

async function insertKnowledgeBit(overrides: {
  id: string;
  knowledgeSourceId: string;
  ordinal: number;
  topicId?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state)
     VALUES ($1, $2, $3, 'A body', $4, 'approved')`,
    [overrides.id, overrides.knowledgeSourceId, overrides.ordinal, overrides.topicId ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'A prompt?', 'An answer')`,
    [`qv_${overrides.id}`, overrides.id],
  );
}

async function insertSchedule(overrides: {
  knowledgeBitId: string;
  dueAt: Date;
  suspendedAt?: Date;
  buriedUntil?: Date;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, review_count, suspended_at, buried_until)
     VALUES ($1, $2, 1, $3, $4)`,
    [
      overrides.knowledgeBitId,
      overrides.dueAt.toISOString(),
      overrides.suspendedAt?.toISOString() ?? null,
      overrides.buriedUntil?.toISOString() ?? null,
    ],
  );
}

describe("getSubjectReviewDueCounts", () => {
  it("should roll each subject's due count up through its sub-subjects at every depth", async () => {
    await insertSubject({ id: "sdc_root", name: "Root" });
    await insertSubject({ id: "sdc_mid", name: "Middle", parentId: "sdc_root" });
    await insertSubject({ id: "sdc_leaf", name: "Leaf", parentId: "sdc_mid" });
    await insertSource({ id: "src_rollup", subjectId: "sdc_leaf" });
    await insertCurriculum({ id: "cur_rollup", subjectId: "sdc_mid" });
    await insertTopic({ id: "top_rollup", curriculumId: "cur_rollup" });

    await insertKnowledgeBit({ id: "bit_rollup_leaf", knowledgeSourceId: "src_rollup", ordinal: 1 });
    await insertSchedule({ knowledgeBitId: "bit_rollup_leaf", dueAt: YESTERDAY });
    await insertKnowledgeBit({
      id: "bit_rollup_mid",
      knowledgeSourceId: "src_rollup",
      ordinal: 2,
      topicId: "top_rollup",
    });
    await insertSchedule({ knowledgeBitId: "bit_rollup_mid", dueAt: YESTERDAY });

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const dueBySubject = Object.fromEntries(counts.subjects.map((row) => [row.subjectId, row.dueCount]));

    expect(dueBySubject).toMatchObject({ sdc_leaf: 1, sdc_mid: 2, sdc_root: 2 });
  });

  it("should count a bit filed directly on a parent subject in the parent's own due and new totals", async () => {
    await insertSubject({ id: "sdc_own_parent", name: "Own parent" });
    await insertSubject({ id: "sdc_own_child", name: "Own child", parentId: "sdc_own_parent" });
    await insertSource({ id: "src_own_parent", subjectId: "sdc_own_parent" });
    await insertSource({ id: "src_own_child", subjectId: "sdc_own_child" });

    await insertKnowledgeBit({ id: "bit_own_due", knowledgeSourceId: "src_own_parent", ordinal: 1 });
    await insertSchedule({ knowledgeBitId: "bit_own_due", dueAt: YESTERDAY });
    await insertKnowledgeBit({ id: "bit_own_new", knowledgeSourceId: "src_own_parent", ordinal: 2 });
    await insertKnowledgeBit({ id: "bit_own_child_new", knowledgeSourceId: "src_own_child", ordinal: 3 });

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const byId = Object.fromEntries(counts.subjects.map((row) => [row.subjectId, row]));

    expect(byId.sdc_own_parent).toEqual({ subjectId: "sdc_own_parent", dueCount: 1, newCount: 2 });
    expect(byId.sdc_own_child).toEqual({ subjectId: "sdc_own_child", dueCount: 0, newCount: 1 });
  });

  it("should count an unplaced bit through its source's subject, without a curriculum placement", async () => {
    await insertSubject({ id: "sdc_unplaced", name: "Unplaced home" });
    await insertSource({ id: "src_unplaced", subjectId: "sdc_unplaced" });
    await insertKnowledgeBit({ id: "bit_unplaced_new", knowledgeSourceId: "src_unplaced", ordinal: 1 });

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const row = counts.subjects.find((subject) => subject.subjectId === "sdc_unplaced");

    expect(row).toEqual({ subjectId: "sdc_unplaced", dueCount: 0, newCount: 1 });
  });

  it("should exclude suspended and currently buried bits from the due count", async () => {
    await insertSubject({ id: "sdc_controls", name: "Controls" });
    await insertSource({ id: "src_controls", subjectId: "sdc_controls" });

    await insertKnowledgeBit({ id: "bit_ctl_live", knowledgeSourceId: "src_controls", ordinal: 1 });
    await insertSchedule({ knowledgeBitId: "bit_ctl_live", dueAt: YESTERDAY });
    await insertKnowledgeBit({ id: "bit_ctl_suspended", knowledgeSourceId: "src_controls", ordinal: 2 });
    await insertSchedule({ knowledgeBitId: "bit_ctl_suspended", dueAt: YESTERDAY, suspendedAt: YESTERDAY });
    await insertKnowledgeBit({ id: "bit_ctl_buried", knowledgeSourceId: "src_controls", ordinal: 3 });
    await insertSchedule({ knowledgeBitId: "bit_ctl_buried", dueAt: YESTERDAY, buriedUntil: NEXT_MONTH });
    await insertKnowledgeBit({ id: "bit_ctl_future", knowledgeSourceId: "src_controls", ordinal: 4 });
    await insertSchedule({ knowledgeBitId: "bit_ctl_future", dueAt: NEXT_MONTH });

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const row = counts.subjects.find((subject) => subject.subjectId === "sdc_controls");

    expect(row?.dueCount).toBe(1);
  });

  it("should put bits with no subject into the unsorted bucket and leave subjects untouched", async () => {
    await insertSource({ id: "src_orphan", subjectId: null });
    await insertKnowledgeBit({ id: "bit_orphan_due", knowledgeSourceId: "src_orphan", ordinal: 1 });
    await insertSchedule({ knowledgeBitId: "bit_orphan_due", dueAt: YESTERDAY });

    const counts = await getSubjectReviewDueCounts(CLOCK);

    expect(counts.unsorted).toEqual({ dueCount: 1, newCount: 0 });
    expect(counts.subjects.find((row) => row.subjectId === "sdc_leaf")?.dueCount).toBe(1);
  });
});
