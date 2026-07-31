import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Fix #68 (.planning/curriculum-merge-provenance/scenarios.md) — proves
// clearCurriculumStructure is now provenance-aware: a target curriculum
// that absorbed a merge and later fails through unrelated use must not
// lose the merged-in content when "Retry research"/"Reparse" clears and
// regenerates its own structure. Mirrors the existing
// curriculum-merge-*.integration.test.ts harness exactly: real Postgres
// (the e2e docker-compose DB on localhost:5436, never mocked), DATABASE_URL
// required and asserted local-only before anything opens a connection.
//
// Tests against clearCurriculumStructure/mergeCurricula/deleteCurriculum
// directly, not the LLM-backed orchestrator functions (reparseCurriculum,
// retryResearch, mergeSourcesIntoCurriculum) — the existing suite for this
// feature never mocks the Mastra agent call those functions make.
// setCurriculumStatus(id, 'failed') stands in for "failed later through
// ordinary use", exactly what mergeSourcesIntoCurriculum's own catch block
// does before a learner clicks Retry/Reparse.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { clearCurriculumStructure, deleteCurriculum, mergeCurricula, setCurriculumStatus } =
  await import("./curriculum.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
});

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
  );
}

async function insertCurriculum(
  curriculumId: string,
  subjectId: string,
  name: string,
  status = "ready",
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
  order = 0,
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
  order = 0,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, $5)`,
    [topicId, moduleId, curriculumId, title, order],
  );
}

async function moduleExists(moduleId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM modules WHERE id = $1`, [moduleId]);

  return rows.length > 0;
}

async function topicExists(topicId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM topics WHERE id = $1`, [topicId]);

  return rows.length > 0;
}

async function moduleTitle(moduleId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT title FROM modules WHERE id = $1`, [moduleId]);

  return rows[0]?.title ?? null;
}

async function insertGap(gapId: string, topicId: string, label: string): Promise<void> {
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, label],
  );
}

async function gapExists(gapId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM gaps WHERE id = $1`, [gapId]);

  return rows.length > 0;
}

interface MergeOutcome {
  error?: string;
  modulesMoved?: number;
  topicsMoved?: number;
}

describe("SCENARIO 1 — merge then later unrelated failure then retry preserves merged-in content", () => {
  it("clearCurriculumStructure preserves merged-in modules/topics when a target that absorbed a merge fails later through unrelated use and is retried", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S1 subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Target A", "ready");
    await insertCurriculum(sourceId, subjectId, "Source B", "ready");

    const targetModuleId = id("mod-native");
    const targetTopicId = id("top-native");
    await insertModule(targetModuleId, targetId, "A's own native module");
    await insertTopic(targetTopicId, targetModuleId, targetId, "A's own native topic");

    const sourceModuleId = id("mod-merged");
    const sourceTopicId = id("top-merged");
    await insertModule(sourceModuleId, sourceId, "B's module, merged into A");
    await insertTopic(sourceTopicId, sourceModuleId, sourceId, "B's topic, merged into A");

    const survivingGapId = id("gap-survives");
    await insertGap(survivingGapId, sourceTopicId, "gap under B's merged-in topic");

    const clearedGapId = id("gap-cleared");
    await insertGap(clearedGapId, targetTopicId, "gap under A's own native topic");

    const mergeResult = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();
    expect(mergeResult.modulesMoved).toBe(1);
    expect(mergeResult.topicsMoved).toBe(1);

    // Time passes — A independently fails later through ordinary use (e.g.
    // mergeSourcesIntoCurriculum's synthesis call throws).
    await setCurriculumStatus(targetId, "failed");

    // The learner clicks Retry research/Reparse on A's FailedBanner — both
    // begin with clearCurriculumStructure(A) with no options, inheriting
    // the protective default.
    await clearCurriculumStructure(targetId);

    expect(await moduleExists(sourceModuleId)).toBe(true);
    expect(await topicExists(sourceTopicId)).toBe(true);
    expect(await moduleTitle(sourceModuleId)).toBe("B's module, merged into A");

    expect(await moduleExists(targetModuleId)).toBe(false);
    expect(await topicExists(targetTopicId)).toBe(false);

    // Gaps attached to a surviving merged-in topic are not deleted
    // alongside it — only gaps under topics that actually get cleared.
    expect(await gapExists(survivingGapId)).toBe(true);
    expect(await gapExists(clearedGapId)).toBe(false);
  });
});

describe("SCENARIO 2 — an all-native curriculum reparses exactly as before", () => {
  it("clearCurriculumStructure on a curriculum with no merged-in content deletes 100% of its modules/topics, unchanged from pre-fix behavior", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S2 subject");

    const curriculumId = id("cur");
    await insertCurriculum(curriculumId, subjectId, "All-native curriculum", "ready");

    const moduleId = id("mod");
    const topicId = id("top");
    await insertModule(moduleId, curriculumId, "Native module");
    await insertTopic(topicId, moduleId, curriculumId, "Native topic");

    await clearCurriculumStructure(curriculumId);

    expect(await moduleExists(moduleId)).toBe(false);
    expect(await topicExists(topicId)).toBe(false);
  });
});

describe("SCENARIO 3 — deleteCurriculum still removes everything, merged-in or not", () => {
  it("deleteCurriculum deletes every module/topic under the curriculum regardless of merge provenance, plus the curriculum row itself", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S3 subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Target A", "ready");
    await insertCurriculum(sourceId, subjectId, "Source B", "ready");

    const targetModuleId = id("mod-native");
    await insertModule(targetModuleId, targetId, "A's own native module");

    const sourceModuleId = id("mod-merged");
    await insertModule(sourceModuleId, sourceId, "B's module, merged into A");

    const mergeResult = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();
    expect(mergeResult.modulesMoved).toBe(1);

    const deleted = await deleteCurriculum(targetId);
    expect(deleted).toBe(true);

    expect(await moduleExists(targetModuleId)).toBe(false);
    expect(await moduleExists(sourceModuleId)).toBe(false);

    const { rows: curriculumRows } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE id = $1`,
      [targetId],
    );
    expect(curriculumRows[0]!.n).toBe(0);
  });
});

describe("SCENARIO 4 — a merge chain preserves provenance through more than one hop", () => {
  it("B's modules, moved into A then into Z, are still marked non-native under Z and protected by a later clear", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S4 subject");

    const bId = id("b");
    const aId = id("a");
    const zId = id("z");
    await insertCurriculum(bId, subjectId, "Curriculum B", "ready");
    await insertCurriculum(aId, subjectId, "Curriculum A", "ready");
    await insertCurriculum(zId, subjectId, "Curriculum Z", "ready");

    const bModuleId = id("mod-b");
    const bTopicId = id("top-b");
    await insertModule(bModuleId, bId, "B's original module");
    await insertTopic(bTopicId, bModuleId, bId, "B's original topic");

    const firstMerge = (await mergeCurricula(aId, bId)) as MergeOutcome;
    expect(firstMerge.error).toBeUndefined();
    expect(firstMerge.modulesMoved).toBe(1);

    const { rows: afterFirstMerge } = await client.query(
      `SELECT merged_from_curriculum_id FROM modules WHERE id = $1`,
      [bModuleId],
    );
    expect(afterFirstMerge[0]!.merged_from_curriculum_id).toBe(bId);

    const secondMerge = (await mergeCurricula(zId, aId)) as MergeOutcome;
    expect(secondMerge.error).toBeUndefined();
    expect(secondMerge.modulesMoved).toBe(1);

    // The marker set at B->A merge time is preserved (not overwritten to A)
    // when the same row moves again at A->Z merge time.
    const { rows: afterSecondMerge } = await client.query(
      `SELECT merged_from_curriculum_id, curriculum_id FROM modules WHERE id = $1`,
      [bModuleId],
    );
    expect(afterSecondMerge[0]!.merged_from_curriculum_id).toBe(bId);
    expect(afterSecondMerge[0]!.curriculum_id).toBe(zId);

    const { rows: topicAfterSecondMerge } = await client.query(
      `SELECT merged_from_curriculum_id, curriculum_id FROM topics WHERE id = $1`,
      [bTopicId],
    );
    expect(topicAfterSecondMerge[0]!.merged_from_curriculum_id).toBe(bId);
    expect(topicAfterSecondMerge[0]!.curriculum_id).toBe(zId);

    // A subsequent clearCurriculumStructure(Z) still protects these rows.
    await clearCurriculumStructure(zId);

    expect(await moduleExists(bModuleId)).toBe(true);
    expect(await topicExists(bTopicId)).toBe(true);
  });
});
