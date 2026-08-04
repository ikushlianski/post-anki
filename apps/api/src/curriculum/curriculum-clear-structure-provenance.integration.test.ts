import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

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

async function insertGap(gapId: string, topicId: string): Promise<void> {
  await client.query(`INSERT INTO gaps (id, topic_id, label) VALUES ($1, $2, $3)`, [
    gapId,
    topicId,
    `gap for ${topicId}`,
  ]);
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
