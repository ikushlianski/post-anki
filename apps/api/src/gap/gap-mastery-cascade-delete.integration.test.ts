import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 1 (.planning/gap-mastery-cascade-delete/scenarios.md) — the one
// real-DB proof that deleting a topic/module/curriculum also deletes the
// gap_mastery row(s) for the gaps it owns, closing the orphaned-row leak
// documented in spec.md. This is an integration test, not a Playwright e2e
// test, by the plan's own explicit proof-mechanism note: every gap_mastery
// reader joins through gaps, so a browser test cannot observe an orphaned
// row in either direction. Harness shape mirrors
// apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts
// (real Postgres via DATABASE_URL/E2E_DATABASE_URL, assertLocalDbTarget
// guard, randomUUID-suffixed seed rows via raw SQL insert) exactly, per the
// precedent named in scenarios.md and generalize-gap-tracking's SCENARIO 8.
//
// RED by design: as of this commit, none of the four deletion functions
// under test delete gap_mastery rows at all (spec.md "What to do"), so
// every case below is expected to fail until the fix (a shared
// deleteGapMasteryForGapIds helper, wired into all four call sites inside a
// transaction) is implemented.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
// Unused by any of the four deletion functions under test — set defensively
// only because loadEnv() validates the whole environment shape up front,
// matching gap-mastery-concurrency.integration.test.ts's own guard.
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { deleteTopic } = await import("../topic/topic.repo.js");
const { deleteModule } = await import("../module/module.repo.js");
const { deleteModules, deleteCurriculum } = await import("../curriculum/curriculum.repo.js");

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

interface SeededGap {
  gapId: string;
  topicId: string;
  moduleId: string;
  curriculumId: string;
}

// Seeds one full subject → curriculum → module → topic → gap → gap_mastery
// chain, all scenery (per state-fixtures.md's Setup role note) — the
// subject under test is the deletion call itself, invoked directly against
// the real repo functions, never through the browser. Every call seeds its
// own fresh subject/curriculum/module, so the four cases (and the two
// gaps in the bulk case) never collide with each other or with ambient
// data in the shared postanki_e2e DB.
async function seedGapWithMastery(): Promise<SeededGap> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");
  const masteryId = id("gapmastery");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Cascade delete test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Cascade delete test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Cascade delete test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Cascade delete test topic"],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, "Cascade delete test gap"],
  );
  // status: 'struggling' — a real, non-default status, so the row's
  // disappearance can't be mistaken for "no row was ever there" (mirrors
  // state-fixtures.md's explicit note on why a non-default status matters).
  await client.query(
    `INSERT INTO gap_mastery (id, gap_id, status, mastery_stage, correct_count_in_cycle, incorrect_count_in_cycle)
     VALUES ($1, $2, 'struggling', 1, 1, 2)`,
    [masteryId, gapId],
  );

  return { gapId, topicId, moduleId, curriculumId };
}

async function masteryRowCountForGap(gapId: string): Promise<number> {
  const { rows } = await client.query(`SELECT * FROM gap_mastery WHERE gap_id = $1`, [gapId]);

  return rows.length;
}

describe("SCENARIO 1 — deleting a gap's topic, module, or curriculum also deletes its gap_mastery row", () => {
  it("deleteTopic on a topic whose gap has an active gap_mastery row leaves zero gap_mastery rows for that gap id", async () => {
    const seeded = await seedGapWithMastery();

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(1);

    await deleteTopic(seeded.topicId);

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(0);
  }, 30_000);

  it("deleteModule on a module owning one topic with a mastery-tracked gap leaves zero gap_mastery rows for that gap id", async () => {
    const seeded = await seedGapWithMastery();

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(1);

    await deleteModule(seeded.moduleId);

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(0);
  }, 30_000);

  it("deleteModules (bulk) on two modules, each owning a topic with a mastery-tracked gap, leaves zero gap_mastery rows for BOTH gap ids", async () => {
    const seededA = await seedGapWithMastery();
    const seededB = await seedGapWithMastery();

    expect(await masteryRowCountForGap(seededA.gapId)).toBe(1);
    expect(await masteryRowCountForGap(seededB.gapId)).toBe(1);

    await deleteModules([seededA.moduleId, seededB.moduleId]);

    expect(await masteryRowCountForGap(seededA.gapId)).toBe(0);
    expect(await masteryRowCountForGap(seededB.gapId)).toBe(0);
  }, 30_000);

  it("clearCurriculumStructure (via deleteCurriculum) on a curriculum owning a module owning a topic with a mastery-tracked gap leaves zero gap_mastery rows", async () => {
    const seeded = await seedGapWithMastery();

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(1);

    await deleteCurriculum(seeded.curriculumId);

    expect(await masteryRowCountForGap(seeded.gapId)).toBe(0);
  }, 30_000);
});
