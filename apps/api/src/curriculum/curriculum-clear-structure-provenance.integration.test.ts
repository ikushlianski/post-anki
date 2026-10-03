import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Items 6 & 7 below share this file's real-Postgres setup: a module/topic
// merged in from an absorbed curriculum is already proven to survive
// `clearCurriculumStructure` (the describe blocks above); these two prove
// the same provenance marker also protects a merged-in module from
// `mergeSourcesIntoCurriculum`'s "free module" deletion, and a merged-in
// source row from `deleteAllCurriculumSources`'s "retry research" wipe.
// Both orchestrator entry points call out to the curriculum-architect
// agent and/or live source-candidate gathering, which this file mocks —
// only the DB-level provenance behavior is under test here.
const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { curriculumArchitect: "curriculumArchitect" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("./source-candidates.js", () => ({
  gatherSourceCandidates: vi.fn().mockResolvedValue([]),
}));

// docs/architecture/curriculum-merge/review.md's "Proposed alternative" #1.
// A curriculum that absorbed another one's content can independently fail
// LATER through ordinary use; the recovery action then calls
// clearCurriculumStructure(), which used to delete every module/topic under
// that curriculum id with no concept of where they came from. The merged-in
// curriculum's row is gone by then, so that is total loss with no surviving
// copy. These tests exercise exactly that sequence, plus the two ways the
// fix could regress: an explicit deleteCurriculum must still remove
// everything (no orphans), and the gap/gap-mastery cascade must be scoped to
// the topics actually being deleted.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `curr_clear_prov_${randomUUID().replace(/-/g, "_")}`;
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

const { clearCurriculumStructure, deleteCurriculum, mergeCurricula } = await import(
  "./curriculum.repo.js"
);
const { createTopic } = await import("../topic/topic.repo.js");
const { mergeSourcesIntoCurriculum, retryResearch } = await import(
  "./curriculum-parse.orchestrator.js"
);

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

async function insertSubject(subjectId: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `provenance subject ${subjectId}`],
  );
}

async function insertCurriculum(
  curriculumId: string,
  subjectId: string,
  name: string,
  status: string,
): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, $4)`, [
    curriculumId,
    subjectId,
    name,
    status,
  ]);
}

async function insertModule(
  moduleId: string,
  curriculumId: string,
  title: string,
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`,
    [moduleId, curriculumId, title, order],
  );
}

async function insertTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, title],
  );
}

async function insertUnreleasedTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
     VALUES ($1, $2, $3, $4, 1, false)`,
    [topicId, moduleId, curriculumId, title],
  );
}

async function insertExcludedTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, learning_status)
     VALUES ($1, $2, $3, $4, 1, false, 'skipping')`,
    [topicId, moduleId, curriculumId, title],
  );
}

async function markTopicSelfGraded(topicId: string, grade: number): Promise<void> {
  await client.query(`UPDATE topics SET self_grade = $2 WHERE id = $1`, [topicId, grade]);
}

async function insertGap(gapId: string, topicId: string, origin = "ai"): Promise<void> {
  await client.query(`INSERT INTO gaps (id, topic_id, label, origin) VALUES ($1, $2, $3, $4)`, [
    gapId,
    topicId,
    `gap for ${topicId}`,
    origin,
  ]);
}

async function insertTagAssignment(
  nodeType: "topic" | "module",
  nodeId: string,
  source: "manual" | "auto",
): Promise<void> {
  const tagId = id("tag");

  await client.query(
    `INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $3)`,
    [tagId, `tag ${tagId}`, tagId],
  );
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id, source) VALUES ($1, $2, $3, $4, $5)`,
    [id("tga"), tagId, nodeType, nodeId, source],
  );
}

async function moduleIdsUnder(curriculumId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM modules WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows.map((r) => r.id);
}

async function topicIdsUnder(curriculumId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM topics WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows.map((r) => r.id);
}

async function gapExists(gapId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM gaps WHERE id = $1`, [gapId]);

  return rows.length > 0;
}

async function insertSource(
  sourceId: string,
  curriculumId: string,
  kind: string,
  value: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title) VALUES ($1, $2, $3, $4, $5)`,
    [sourceId, curriculumId, kind, value, title],
  );
}

async function insertDiscoveredSource(
  sourceId: string,
  curriculumId: string,
  value: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, discovery_tier)
     VALUES ($1, $2, 'link', $3, $4, 'docs_crawl')`,
    [sourceId, curriculumId, value, title],
  );
}

async function sourceIdsUnder(curriculumId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM sources WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows.map((r) => r.id);
}

async function insertNote(nodeType: string, nodeId: string): Promise<string> {
  const noteId = id("note");

  await client.query(`INSERT INTO notes (id, node_type, node_id, body) VALUES ($1, $2, $3, $4)`, [
    noteId,
    nodeType,
    nodeId,
    `note on ${nodeType} ${nodeId}`,
  ]);

  return noteId;
}

async function noteExists(noteId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM notes WHERE id = $1`, [noteId]);

  return rows.length > 0;
}

async function insertProbeSessionQuestion(topicId: string): Promise<string> {
  const sessionId = id("probesess");
  const questionId = id("probeq");

  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id) VALUES ($1, 'topic', $2)`,
    [sessionId, topicId],
  );
  await client.query(
    `INSERT INTO probe_session_questions
       (id, session_id, "order", topic_id, prompt, options, correct_answer_index)
     VALUES ($1, $2, 0, $3, 'prompt', '["a","b"]'::jsonb, 0)`,
    [questionId, sessionId, topicId],
  );

  return questionId;
}

async function insertSocraticSession(topicId: string, curriculumId: string): Promise<string> {
  const sessionId = id("socsess");

  await client.query(
    `INSERT INTO socratic_sessions (id, topic_id, curriculum_id) VALUES ($1, $2, $3)`,
    [sessionId, topicId, curriculumId],
  );

  return sessionId;
}

async function socraticSessionExists(sessionId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM socratic_sessions WHERE id = $1`, [
    sessionId,
  ]);

  return rows.length > 0;
}

interface MergedScenario {
  targetId: string;
  ownModuleId: string;
  ownTopicId: string;
  ownGapId: string;
  mergedModuleId: string;
  mergedTopicId: string;
  mergedGapId: string;
}

async function seedMergedCurriculum(): Promise<MergedScenario> {
  const subjectId = id("sub");
  await insertSubject(subjectId);

  const targetId = id("target");
  const sourceId = id("source");
  await insertCurriculum(targetId, subjectId, "Absorbing curriculum", "ready");
  await insertCurriculum(sourceId, subjectId, "Absorbed curriculum", "ready");

  const ownModuleId = id("mod");
  const ownTopicId = id("top");
  const ownGapId = id("gap");
  await insertModule(ownModuleId, targetId, "Target's own module", 1);
  await insertTopic(ownTopicId, ownModuleId, targetId, "Target's own topic");
  await insertGap(ownGapId, ownTopicId);

  const mergedModuleId = id("mod");
  const mergedTopicId = id("top");
  const mergedGapId = id("gap");
  await insertModule(mergedModuleId, sourceId, "Content that must survive", 1);
  await insertTopic(mergedTopicId, mergedModuleId, sourceId, "Topic that must survive");
  await insertGap(mergedGapId, mergedTopicId);

  const result = await mergeCurricula(targetId, sourceId);

  expect(result).toMatchObject({ modulesMoved: 1, topicsMoved: 1 });

  return {
    targetId,
    ownModuleId,
    ownTopicId,
    ownGapId,
    mergedModuleId,
    mergedTopicId,
    mergedGapId,
  };
}

describe("clearCurriculumStructure provenance — merged-in content survives a later recovery clear", () => {
  it("keeps the merged-in module and topic while still clearing the curriculum's own", async () => {
    const scenario = await seedMergedCurriculum();

    await clearCurriculumStructure(scenario.targetId);

    expect(await moduleIdsUnder(scenario.targetId)).toEqual([scenario.mergedModuleId]);
    expect(await topicIdsUnder(scenario.targetId)).toEqual([scenario.mergedTopicId]);
  });

  it("leaves the surviving merged topic's gaps intact and only cascades gaps for the topics it deletes", async () => {
    const scenario = await seedMergedCurriculum();

    await clearCurriculumStructure(scenario.targetId);

    expect(await gapExists(scenario.mergedGapId)).toBe(true);
    expect(await gapExists(scenario.ownGapId)).toBe(false);
  });

  it("keeps a topic added under a merged-in module after the merge", async () => {
    const scenario = await seedMergedCurriculum();

    const added = await createTopic({
      moduleId: scenario.mergedModuleId,
      title: "Added under merged-in module",
    });

    expect(added).not.toBeNull();

    await clearCurriculumStructure(scenario.targetId);

    const surviving = await topicIdsUnder(scenario.targetId);

    expect(surviving).toContain(scenario.mergedTopicId);
    expect(surviving).toContain(added?.id);
    expect(surviving).not.toContain(scenario.ownTopicId);
  });
});

describe("clearCurriculumStructure provenance — a learner's own declared gap survives 'Retry research'/'Reparse'", () => {
  it("keeps the module and topic holding a user-declared gap while clearing the curriculum's other native content", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a declared gap", "failed");

    const gapModuleId = id("mod");
    const gapTopicId = id("top");
    const gapId = id("gap");
    await insertModule(gapModuleId, curriculumId, "Module with a declared gap", 1);
    await insertTopic(gapTopicId, gapModuleId, curriculumId, "Topic the learner asked about");
    await insertGap(gapId, gapTopicId, "user");

    const otherModuleId = id("mod");
    const otherTopicId = id("top");
    await insertModule(otherModuleId, curriculumId, "Ordinary native module", 2);
    await insertTopic(otherTopicId, otherModuleId, curriculumId, "Ordinary native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([gapModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([gapTopicId]);
    expect(await gapExists(gapId)).toBe(true);
  });
});

describe("clearCurriculumStructure provenance — a topic with study progress but no note or gap survives 'Retry research'/'Reparse'", () => {
  it("keeps a self-graded topic while clearing the curriculum's other untouched content", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a graded topic", "failed");

    const gradedModuleId = id("mod");
    const gradedTopicId = id("top");
    await insertModule(gradedModuleId, curriculumId, "Module with a graded topic", 1);
    await insertTopic(gradedTopicId, gradedModuleId, curriculumId, "Topic the learner already graded");
    await markTopicSelfGraded(gradedTopicId, 3);

    const otherModuleId = id("mod");
    const otherTopicId = id("top");
    await insertModule(otherModuleId, curriculumId, "Ordinary native module", 2);
    await insertTopic(otherTopicId, otherModuleId, curriculumId, "Ordinary native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([gradedModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([gradedTopicId]);
  });

  it("clears never-released topics from the ordinary confirm-structure flow, keeping only the one with real progress", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum awaiting slice release", "failed");

    const gradedModuleId = id("mod");
    const gradedTopicId = id("top");
    await insertModule(gradedModuleId, curriculumId, "Module with a graded topic", 1);
    await insertUnreleasedTopic(gradedTopicId, gradedModuleId, curriculumId, "Topic the learner already graded");
    await markTopicSelfGraded(gradedTopicId, 3);

    const unreleasedModuleId = id("mod");
    const unreleasedTopicId = id("top");
    await insertModule(unreleasedModuleId, curriculumId, "Never-released module", 2);
    await insertUnreleasedTopic(
      unreleasedTopicId,
      unreleasedModuleId,
      curriculumId,
      "Never-released, never-touched topic",
    );

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([gradedModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([gradedTopicId]);
  });
});

describe("clearCurriculumStructure provenance — a manually tagged topic survives 'Retry research'/'Reparse'", () => {
  it("keeps a manually tagged topic's module while clearing a module whose only topic carries an auto-assigned tag", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a tagged topic", "failed");

    const taggedModuleId = id("mod");
    const taggedTopicId = id("top");
    await insertModule(taggedModuleId, curriculumId, "Module with a manually tagged topic", 1);
    await insertTopic(taggedTopicId, taggedModuleId, curriculumId, "Topic the learner tagged");
    await insertTagAssignment("topic", taggedTopicId, "manual");

    const autoTaggedModuleId = id("mod");
    const autoTaggedTopicId = id("top");
    await insertModule(autoTaggedModuleId, curriculumId, "Module with an auto-tagged-only topic", 2);
    await insertTopic(autoTaggedTopicId, autoTaggedModuleId, curriculumId, "Topic with only an auto tag");
    await insertTagAssignment("topic", autoTaggedTopicId, "auto");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([taggedModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([taggedTopicId]);
  });

  it("keeps a manually tagged module even when its own topic carries no touch signal", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a tagged module", "failed");

    const taggedModuleId = id("mod");
    const taggedTopicId = id("top");
    await insertModule(taggedModuleId, curriculumId, "Manually tagged module", 1);
    await insertTopic(taggedTopicId, taggedModuleId, curriculumId, "Untouched topic under a tagged module");
    await insertTagAssignment("module", taggedModuleId, "manual");

    const otherModuleId = id("mod");
    const otherTopicId = id("top");
    await insertModule(otherModuleId, curriculumId, "Ordinary native module", 2);
    await insertTopic(otherTopicId, otherModuleId, curriculumId, "Ordinary native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([taggedModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([taggedTopicId]);
  });
});

describe("clearCurriculumStructure provenance — an explicit curriculum delete still removes everything", () => {
  it("leaves zero modules and zero topics behind when the absorbing curriculum is deleted outright", async () => {
    const scenario = await seedMergedCurriculum();

    expect(await deleteCurriculum(scenario.targetId)).toBe(true);

    expect(await moduleIdsUnder(scenario.targetId)).toEqual([]);
    expect(await topicIdsUnder(scenario.targetId)).toEqual([]);
    expect(await gapExists(scenario.mergedGapId)).toBe(false);
    expect(await gapExists(scenario.ownGapId)).toBe(false);
  });
});

// Item 6 — mergeSourcesIntoCurriculum used to classify a merged-in module
// with zero learner progress as "free" (isModuleTouched only looks at
// progress) and silently delete+regenerate it away the next time a learner
// added a source. isModuleMergedIn now locks it independently of progress.
describe("mergeSourcesIntoCurriculum provenance — a merged-in module with zero learner progress survives 'add more sources'", () => {
  it("keeps the merged-in module while replacing the target's own untouched module", async () => {
    const scenario = await seedMergedCurriculum();

    mockAgentGenerate.mockResolvedValueOnce({
      object: { modules: [{ title: "Freshly drafted module", topics: [], tags: null }] },
    });

    await mergeSourcesIntoCurriculum(scenario.targetId, [
      { kind: "text", value: "Newly added source material", title: "New source" },
    ]);

    const survivingTitles = (
      await client.query<{ title: string }>(`SELECT title FROM modules WHERE curriculum_id = $1`, [
        scenario.targetId,
      ])
    ).rows.map((r) => r.title);

    expect(survivingTitles).toContain("Content that must survive");
    expect(survivingTitles).toContain("Freshly drafted module");
    expect(survivingTitles).not.toContain("Target's own module");
  });

  it("keeps a module holding a learner's own declared gap, even with zero progress", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const targetId = id("target");
    await insertCurriculum(targetId, subjectId, "Curriculum with a declared gap", "ready");

    const moduleId = id("mod");
    const topicId = id("top");
    const gapId = id("gap");
    await insertModule(moduleId, targetId, "Module with a declared gap", 1);
    await insertTopic(topicId, moduleId, targetId, "Topic the learner asked about");
    await insertGap(gapId, topicId, "user");

    mockAgentGenerate.mockResolvedValueOnce({
      object: { modules: [{ title: "Freshly drafted module", topics: [], tags: null }] },
    });

    await mergeSourcesIntoCurriculum(targetId, [
      { kind: "text", value: "Newly added source material", title: "New source" },
    ]);

    const survivingTitles = (
      await client.query<{ title: string }>(`SELECT title FROM modules WHERE curriculum_id = $1`, [
        targetId,
      ])
    ).rows.map((r) => r.title);

    expect(survivingTitles).toContain("Module with a declared gap");
    expect(await gapExists(gapId)).toBe(true);
  });

  it("keeps a module holding a topic with an attached note, even with zero progress", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const targetId = id("target");
    await insertCurriculum(targetId, subjectId, "Curriculum with a noted topic", "ready");

    const moduleId = id("mod");
    const topicId = id("top");
    await insertModule(moduleId, targetId, "Module with a noted topic", 1);
    await insertTopic(topicId, moduleId, targetId, "Topic with a note");
    const noteId = await insertNote("topic", topicId);

    mockAgentGenerate.mockResolvedValueOnce({
      object: { modules: [{ title: "Freshly drafted module", topics: [], tags: null }] },
    });

    await mergeSourcesIntoCurriculum(targetId, [
      { kind: "text", value: "Newly added source material", title: "New source" },
    ]);

    const survivingTitles = (
      await client.query<{ title: string }>(`SELECT title FROM modules WHERE curriculum_id = $1`, [
        targetId,
      ])
    ).rows.map((r) => r.title);

    expect(survivingTitles).toContain("Module with a noted topic");
    expect(await noteExists(noteId)).toBe(true);
  });

  it("replaces a never-released module from the ordinary confirm-structure flow, not just an untouched one", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const targetId = id("target");
    await insertCurriculum(targetId, subjectId, "Curriculum awaiting slice release", "ready");

    const unreleasedModuleId = id("mod");
    const unreleasedTopicId = id("top");
    await insertModule(unreleasedModuleId, targetId, "Never-released module", 1);
    await insertUnreleasedTopic(unreleasedTopicId, unreleasedModuleId, targetId, "Never-released topic");

    mockAgentGenerate.mockResolvedValueOnce({
      object: { modules: [{ title: "Freshly drafted module", topics: [], tags: null }] },
    });

    await mergeSourcesIntoCurriculum(targetId, [
      { kind: "text", value: "Newly added source material", title: "New source" },
    ]);

    const survivingTitles = (
      await client.query<{ title: string }>(`SELECT title FROM modules WHERE curriculum_id = $1`, [
        targetId,
      ])
    ).rows.map((r) => r.title);

    expect(survivingTitles).toContain("Freshly drafted module");
    expect(survivingTitles).not.toContain("Never-released module");
  });

  it("keeps a module holding a topic the learner explicitly excluded, even never-released", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const targetId = id("target");
    await insertCurriculum(targetId, subjectId, "Curriculum with an excluded topic", "ready");

    const excludedModuleId = id("mod");
    const excludedTopicId = id("top");
    await insertModule(excludedModuleId, targetId, "Module with an excluded topic", 1);
    await insertExcludedTopic(excludedTopicId, excludedModuleId, targetId, "Topic the learner excluded");

    mockAgentGenerate.mockResolvedValueOnce({
      object: { modules: [{ title: "Freshly drafted module", topics: [], tags: null }] },
    });

    await mergeSourcesIntoCurriculum(targetId, [
      { kind: "text", value: "Newly added source material", title: "New source" },
    ]);

    const survivingTitles = (
      await client.query<{ title: string }>(`SELECT title FROM modules WHERE curriculum_id = $1`, [
        targetId,
      ])
    ).rows.map((r) => r.title);

    expect(survivingTitles).toContain("Module with an excluded topic");
  });
});

// Item 7 — retryResearch's deleteAllCurriculumSources call used to be a
// bare, unconditional delete-by-curriculum_id with no provenance
// awareness, wiping an absorbed course's source links right alongside the
// candidate-gathering rows a retry is actually meant to clear.
describe("retryResearch provenance — a source merged in from an absorbed curriculum survives deleteAllCurriculumSources", () => {
  it("keeps the merged-in source while clearing the target's own sources", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Absorbing curriculum", "ready");
    await insertCurriculum(sourceId, subjectId, "Absorbed curriculum", "ready");

    const ownSourceId = id("src");
    await insertSource(ownSourceId, targetId, "web_research", "https://example.com/own", "Own source");

    const mergedSourceId = id("src");
    await insertSource(
      mergedSourceId,
      sourceId,
      "web_research",
      "https://example.com/merged",
      "Source that must survive",
    );

    await mergeCurricula(targetId, sourceId);

    await retryResearch(targetId);

    const surviving = await sourceIdsUnder(targetId);

    expect(surviving).toContain(mergedSourceId);
    expect(surviving).not.toContain(ownSourceId);
  });

  it("keeps a learner's manually-added link while clearing an auto-discovered candidate", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a manual link", "failed");

    const manualLinkId = id("src");
    await insertSource(manualLinkId, curriculumId, "link", "https://example.com/manual", "Link I added myself");

    const discoveredId = id("src");
    await insertDiscoveredSource(discoveredId, curriculumId, "https://example.com/discovered", "Auto-discovered page");

    await retryResearch(curriculumId);

    const surviving = await sourceIdsUnder(curriculumId);

    expect(surviving).toContain(manualLinkId);
    expect(surviving).not.toContain(discoveredId);
  });
});

describe("notes survive a mutation path that would otherwise orphan them", () => {
  it("keeps a note attached directly to a topic through clearCurriculumStructure", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a noted topic", "failed");

    const notedModuleId = id("mod");
    const notedTopicId = id("top");
    await insertModule(notedModuleId, curriculumId, "Module with a noted topic", 1);
    await insertTopic(notedTopicId, notedModuleId, curriculumId, "Topic with a note");
    const noteId = await insertNote("topic", notedTopicId);

    await clearCurriculumStructure(curriculumId);

    expect(await topicIdsUnder(curriculumId)).toContain(notedTopicId);
    expect(await noteExists(noteId)).toBe(true);
  });

  it("keeps a note attached to a gap, and the topic it belongs to, through clearCurriculumStructure", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a noted gap", "failed");

    const gapModuleId = id("mod");
    const gapTopicId = id("top");
    const gapId = id("gap");
    await insertModule(gapModuleId, curriculumId, "Module with a noted gap", 1);
    await insertTopic(gapTopicId, gapModuleId, curriculumId, "Topic holding the noted gap");
    await insertGap(gapId, gapTopicId);
    const noteId = await insertNote("gap", gapId);

    await clearCurriculumStructure(curriculumId);

    expect(await topicIdsUnder(curriculumId)).toContain(gapTopicId);
    expect(await gapExists(gapId)).toBe(true);
    expect(await noteExists(noteId)).toBe(true);
  });

  it("keeps a note attached to a source through deleteAllCurriculumSources", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a noted source", "failed");

    const notedSourceId = id("src");
    await insertSource(notedSourceId, curriculumId, "web_research", "https://example.com/noted", "Noted source");
    const noteId = await insertNote("source", notedSourceId);

    const otherSourceId = id("src");
    await insertSource(otherSourceId, curriculumId, "web_research", "https://example.com/other", "Other source");

    await retryResearch(curriculumId);

    const surviving = await sourceIdsUnder(curriculumId);

    expect(surviving).toContain(notedSourceId);
    expect(surviving).not.toContain(otherSourceId);
    expect(await noteExists(noteId)).toBe(true);
  });
});

describe("quiz and Socratic session history survive a curriculum clear that would otherwise orphan them", () => {
  it("keeps a topic with a probe-session question through 'Retry research'/'Reparse'", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a quizzed topic", "failed");

    const quizzedModuleId = id("mod");
    const quizzedTopicId = id("top");
    await insertModule(quizzedModuleId, curriculumId, "Module with a quizzed topic", 1);
    await insertTopic(quizzedTopicId, quizzedModuleId, curriculumId, "Topic the learner was quizzed on");
    const questionId = await insertProbeSessionQuestion(quizzedTopicId);

    const otherModuleId = id("mod");
    const otherTopicId = id("top");
    await insertModule(otherModuleId, curriculumId, "Ordinary native module", 2);
    await insertTopic(otherTopicId, otherModuleId, curriculumId, "Ordinary native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([quizzedModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([quizzedTopicId]);

    const { rows } = await client.query(`SELECT id FROM probe_session_questions WHERE id = $1`, [
      questionId,
    ]);

    expect(rows.length).toBe(1);
  });

  it("keeps a topic with a Socratic session through 'Retry research'/'Reparse'", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("target");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a Socratic topic", "failed");

    const socraticModuleId = id("mod");
    const socraticTopicId = id("top");
    await insertModule(socraticModuleId, curriculumId, "Module with a Socratic topic", 1);
    await insertTopic(socraticTopicId, socraticModuleId, curriculumId, "Topic with a Socratic session");
    const sessionId = await insertSocraticSession(socraticTopicId, curriculumId);

    const otherModuleId = id("mod");
    const otherTopicId = id("top");
    await insertModule(otherModuleId, curriculumId, "Ordinary native module", 2);
    await insertTopic(otherTopicId, otherModuleId, curriculumId, "Ordinary native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleIdsUnder(curriculumId)).toEqual([socraticModuleId]);
    expect(await topicIdsUnder(curriculumId)).toEqual([socraticTopicId]);
    expect(await socraticSessionExists(sessionId)).toBe(true);
  });
});
