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
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `milestone_repo_${randomUUID().replace(/-/g, "_")}`;
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

const {
  awardIfNew,
  evaluateAndAwardMilestones,
  getCurriculumCompletionCandidates,
  getAreaCompletionCandidates,
  listMilestones,
} = await import("./milestone.repo.js");

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

async function insertCurriculum(
  curriculumId: string,
  subjectId: string,
  name: string,
  status = "confirmed",
): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, $4)`, [
    curriculumId,
    subjectId,
    name,
    status,
  ]);
}

async function insertModule(moduleId: string, curriculumId: string): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`, [
    moduleId,
    curriculumId,
  ]);
}

async function insertTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  maturity: number,
  included = true,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, progress_status, progress_maturity)
     VALUES ($1, $2, $3, 'Topic', 0, $4, $5, $6)`,
    [topicId, moduleId, curriculumId, included, maturity >= 80 ? "mastered" : "in_progress", maturity],
  );
}

async function insertDomainNode(
  nodeId: string,
  subjectId: string,
  name: string,
  kind: string | null = null,
  parentId: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, name, kind, parent_id) VALUES ($1, $2, $3, $4, $5)`,
    [nodeId, subjectId, name, kind, parentId],
  );
}

async function insertMapping(
  mappingId: string,
  curriculumId: string,
  domainNodeId: string,
  status: "suggested" | "confirmed" | "rejected",
): Promise<void> {
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status) VALUES ($1, $2, $3, $4)`,
    [mappingId, curriculumId, domainNodeId, status],
  );
}

async function fullyMasteredCurriculum(subjectId: string): Promise<string> {
  const curriculumId = id("cur");
  const moduleId = id("mod");

  await insertCurriculum(curriculumId, subjectId, "React Effects & Synchronization");
  await insertModule(moduleId, curriculumId);
  await insertTopic(id("top"), moduleId, curriculumId, 100);

  return curriculumId;
}

describe("SCENARIO 1 — a curriculum reaching 100% mastered awards a milestone on the next read", () => {
  it("awards a curriculum milestone once its own moduleProgress percent reaches 100", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    const before = await getCurriculumCompletionCandidates();
    expect(before.find((c) => c.entityId === curriculumId)?.percent).toBe(100);

    await evaluateAndAwardMilestones();

    const rows = await listMilestones();
    const awarded = rows.find((row) => row.entityId === curriculumId);

    expect(awarded).toBeDefined();
    expect(awarded!.entityType).toBe("curriculum");
    expect(awarded!.criteriaKey).toBe("full_mastery");
    expect(awarded!.entityLabel).toBe("React Effects & Synchronization");
  });

  it("stamps achievedAt at the moment of the read, not backdated to when mastery actually happened", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));
    const readAt = new Date(Date.now() + 60_000).toISOString();

    await evaluateAndAwardMilestones(readAt);

    const awarded = (await listMilestones()).find((row) => row.entityId === curriculumId);

    expect(awarded!.achievedAt).toBe(readAt);
  });

  it("never awards a curriculum that has not reached 100 percent", async () => {
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const subjectId = id("subj");

    await insertCurriculum(curriculumId, subjectId, "In progress curriculum");
    await insertModule(moduleId, curriculumId);
    await insertTopic(id("top"), moduleId, curriculumId, 91);

    await evaluateAndAwardMilestones();

    expect((await listMilestones()).find((row) => row.entityId === curriculumId)).toBeUndefined();
  });

  it("never counts a curriculum still in draft toward completion, even with fully-mastered topics", async () => {
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const subjectId = id("subj");

    await insertCurriculum(curriculumId, subjectId, "Unconfirmed curriculum", "draft");
    await insertModule(moduleId, curriculumId);
    await insertTopic(id("top"), moduleId, curriculumId, 100);

    await evaluateAndAwardMilestones();

    expect((await listMilestones()).find((row) => row.entityId === curriculumId)).toBeUndefined();
  });
});

describe("SCENARIO 2 — an Area reaching 100% mastered awards a milestone the same way", () => {
  it("awards an Area milestone once every confirmed curriculum mapped under it is fully mastered", async () => {
    const subjectId = id("subj");
    const areaId = id("dn");
    const curriculumId = await fullyMasteredCurriculum(subjectId);

    await insertDomainNode(areaId, subjectId, "State Management", "area");
    await insertMapping(id("map"), curriculumId, areaId, "confirmed");

    const before = await getAreaCompletionCandidates();
    expect(before.find((c) => c.entityId === areaId)?.percent).toBe(100);

    await evaluateAndAwardMilestones();

    const awarded = (await listMilestones()).find((row) => row.entityId === areaId);

    expect(awarded).toBeDefined();
    expect(awarded!.entityType).toBe("domain_node");
    expect(awarded!.entityLabel).toBe("State Management");
  });

  it("never awards an Area with no confirmed curriculum mapped under it", async () => {
    const subjectId = id("subj");
    const areaId = id("dn");

    await insertDomainNode(areaId, subjectId, "Empty Area", "area");

    await evaluateAndAwardMilestones();

    expect((await listMilestones()).find((row) => row.entityId === areaId)).toBeUndefined();
  });

  it("ignores a curriculum whose mapping to the Area is only suggested, not confirmed", async () => {
    const subjectId = id("subj");
    const areaId = id("dn");
    const curriculumId = await fullyMasteredCurriculum(subjectId);

    await insertDomainNode(areaId, subjectId, "Suggested-only Area", "area");
    await insertMapping(id("map"), curriculumId, areaId, "suggested");

    await evaluateAndAwardMilestones();

    expect((await listMilestones()).find((row) => row.entityId === areaId)).toBeUndefined();
  });
});

describe("SCENARIO 3 — a milestone is recorded exactly once, never regenerated on a later read", () => {
  it("produces exactly one row across five reads of an already-100%-mastered curriculum", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    for (let i = 0; i < 5; i += 1) {
      await evaluateAndAwardMilestones();
    }

    const rows = await client.query(
      `SELECT id, achieved_at FROM milestones WHERE entity_type = 'curriculum' AND entity_id = $1`,
      [curriculumId],
    );

    expect(rows.rowCount).toBe(1);
  });

  it("keeps achievedAt unchanged across repeated reads", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    await evaluateAndAwardMilestones("2026-01-01T00:00:00.000Z");
    await evaluateAndAwardMilestones("2026-06-01T00:00:00.000Z");

    const awarded = (await listMilestones()).find((row) => row.entityId === curriculumId);

    expect(awarded!.achievedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("SCENARIO 4 — two concurrent reads never produce two milestone rows for the same achievement", () => {
  it("relies on the DB unique index, not the app-level pre-filter: two direct concurrent awardIfNew calls for the same ref insert only one row", async () => {
    const ref = { entityType: "curriculum" as const, entityId: id("cur"), criteriaKey: "full_mastery" };

    const results = await Promise.all([awardIfNew(ref), awardIfNew(ref)]);

    expect(results.filter(Boolean).length).toBe(1);

    const rows = await client.query(
      `SELECT id FROM milestones WHERE entity_type = $1 AND entity_id = $2 AND criteria_key = $3`,
      [ref.entityType, ref.entityId, ref.criteriaKey],
    );

    expect(rows.rowCount).toBe(1);
  });

  it("never surfaces the losing insert's unique violation as an error", async () => {
    const ref = { entityType: "curriculum" as const, entityId: id("cur"), criteriaKey: "full_mastery" };

    await awardIfNew(ref);

    await expect(awardIfNew(ref)).resolves.toBe(false);
  });

  it("does not double-award when two concurrent evaluateAndAwardMilestones reads race over the same newly-complete curriculum", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    await Promise.all([evaluateAndAwardMilestones(), evaluateAndAwardMilestones()]);

    const rows = await client.query(
      `SELECT id FROM milestones WHERE entity_type = 'curriculum' AND entity_id = $1`,
      [curriculumId],
    );

    expect(rows.rowCount).toBe(1);
  });
});

describe("SCENARIO 5 — milestone evaluation only happens when the milestones page is opened", () => {
  it("computing completion candidates alone never writes a row — only evaluateAndAwardMilestones does", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    await getCurriculumCompletionCandidates();

    expect((await listMilestones()).find((row) => row.entityId === curriculumId)).toBeUndefined();
  });

  it("still correctly awards a curriculum that reached 100% long ago and has never had /milestones opened since", async () => {
    const curriculumId = await fullyMasteredCurriculum(id("subj"));

    const firstEverRead = new Date().toISOString();
    await evaluateAndAwardMilestones(firstEverRead);

    const awarded = (await listMilestones()).find((row) => row.entityId === curriculumId);

    expect(awarded).toBeDefined();
    expect(awarded!.achievedAt).toBe(firstEverRead);
  });
});

describe("SCENARIO 6 — a later structural change never revokes or flags an already-awarded milestone", () => {
  it("survives its curriculum's live percent dropping below the threshold, with achievedAt untouched", async () => {
    const subjectId = id("subj");
    const curriculumId = await fullyMasteredCurriculum(subjectId);

    await evaluateAndAwardMilestones("2026-01-01T00:00:00.000Z");

    const awardedBefore = (await listMilestones()).find((row) => row.entityId === curriculumId);
    expect(awardedBefore).toBeDefined();

    // learning-list intake folds a fresh, un-mastered topic into the
    // already-100%-mastered curriculum — the exact regression this
    // guarantee exists to survive.
    const moduleRow = await client.query(`SELECT id FROM modules WHERE curriculum_id = $1`, [
      curriculumId,
    ]);
    await insertTopic(id("top"), moduleRow.rows[0].id, curriculumId, 0);

    const liveCandidates = await getCurriculumCompletionCandidates();
    const livePercent = liveCandidates.find((c) => c.entityId === curriculumId)?.percent;
    expect(livePercent).toBeLessThan(100);

    await evaluateAndAwardMilestones("2026-06-01T00:00:00.000Z");

    const rows = await client.query(
      `SELECT id, achieved_at FROM milestones WHERE entity_type = 'curriculum' AND entity_id = $1`,
      [curriculumId],
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].id).toBe(awardedBefore!.id);
    expect(new Date(rows.rows[0].achieved_at as string).toISOString()).toBe(awardedBefore!.achievedAt);

    const awardedAfter = (await listMilestones()).find((row) => row.entityId === curriculumId);
    expect(awardedAfter!.achievedAt).toBe(awardedBefore!.achievedAt);
  });

  it("reads the milestones table only — never re-derives from a live percent that would otherwise disqualify the row", async () => {
    const subjectId = id("subj");
    const curriculumId = await fullyMasteredCurriculum(subjectId);

    await evaluateAndAwardMilestones();

    const moduleRow = await client.query(`SELECT id FROM modules WHERE curriculum_id = $1`, [
      curriculumId,
    ]);
    await insertTopic(id("top"), moduleRow.rows[0].id, curriculumId, 0);
    await insertTopic(id("top"), moduleRow.rows[0].id, curriculumId, 0);

    const stillAwarded = await listMilestones();

    expect(stillAwarded.find((row) => row.entityId === curriculumId)).toBeDefined();
  });
});
