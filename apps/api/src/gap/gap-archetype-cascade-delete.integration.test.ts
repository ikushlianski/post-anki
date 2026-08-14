import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 8 (.planning/36-archetype-rotation/scenarios.md) — deleting a
// gap's topic's module or curriculum also deletes its gap_archetype_state
// row (AC 35, 36), mirroring gap-mastery-cascade-delete.integration.test.ts's
// exact harness and seeding shape. `deleteTopic` (topic.repo.ts) is
// deliberately NOT touched by this pass (fenced, cards-related WIP) — the
// companion test below proves that gap unmodified, exactly as spec.md
// Decision 7 discloses.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `gap_archetype_cascade_${randomUUID().replace(/-/g, "_")}`;
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

interface SeededGap {
  gapId: string;
  topicId: string;
  moduleId: string;
  curriculumId: string;
}

async function seedGapWithArchetypeState(): Promise<SeededGap> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");
  const stateId = id("gaparch");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Archetype cascade delete test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Archetype cascade delete test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Archetype cascade delete test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Archetype cascade delete test topic"],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, "Archetype cascade delete test gap"],
  );
  await client.query(
    `INSERT INTO gap_archetype_state (id, gap_id, applicable_archetypes, archetype_last_used_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      stateId,
      gapId,
      JSON.stringify(["scenario_based", "design_challenge"]),
      JSON.stringify({
        scenario_based: "2026-08-01T00:00:00.000Z",
        compare_contrast: null,
        design_challenge: null,
        cross_cutting: null,
        debug_challenge: null,
      }),
    ],
  );

  return { gapId, topicId, moduleId, curriculumId };
}

async function archetypeStateRowCountForGap(gapId: string): Promise<number> {
  const { rows } = await client.query(`SELECT * FROM gap_archetype_state WHERE gap_id = $1`, [
    gapId,
  ]);

  return rows.length;
}

describe("SCENARIO 8 — deleting a gap's module or curriculum also deletes its gap_archetype_state row (AC 35, 36)", () => {
  it("deleteModule on a module owning one topic with a classified gap leaves zero gap_archetype_state rows for that gap id", async () => {
    const seeded = await seedGapWithArchetypeState();

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(1);

    await deleteModule(seeded.moduleId);

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(0);
  }, 30_000);

  it("deleteModules (bulk) on two modules, each owning a topic with a classified gap, leaves zero rows for BOTH gap ids", async () => {
    const seededA = await seedGapWithArchetypeState();
    const seededB = await seedGapWithArchetypeState();

    expect(await archetypeStateRowCountForGap(seededA.gapId)).toBe(1);
    expect(await archetypeStateRowCountForGap(seededB.gapId)).toBe(1);

    await deleteModules([seededA.moduleId, seededB.moduleId]);

    expect(await archetypeStateRowCountForGap(seededA.gapId)).toBe(0);
    expect(await archetypeStateRowCountForGap(seededB.gapId)).toBe(0);
  }, 30_000);

  it("clearCurriculumStructure (via deleteCurriculum) on a curriculum owning a module owning a topic with a classified gap leaves zero rows", async () => {
    const seeded = await seedGapWithArchetypeState();

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(1);

    await deleteCurriculum(seeded.curriculumId);

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(0);
  }, 30_000);

  it("deleteTopic (topic.repo.ts, fenced for this task) does NOT delete the gap_archetype_state row — the disclosed, real follow-up leak", async () => {
    const seeded = await seedGapWithArchetypeState();

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(1);

    await deleteTopic(seeded.topicId);

    expect(await archetypeStateRowCountForGap(seeded.gapId)).toBe(1);
  }, 30_000);
});
