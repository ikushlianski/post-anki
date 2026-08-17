import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 3 (.planning/curriculum-merge/scenarios.md) — the merge-vs-merge
// concurrency race proof for curriculum merge, mirroring
// ontology-split-merge's own SCENARIO 5 (subject-merge-concurrency.
// integration.test.ts) exactly: real Postgres (the e2e docker-compose DB on
// localhost:5436, never mocked), two concurrent calls fired via Promise.all
// against the real connection pool, DATABASE_URL required and asserted
// local-only before anything opens a connection.
//
// Like mergeSubjects, mergeCurricula is designed to never throw on a lost
// race — it returns a discriminated { error: "not_found" } result instead,
// which is what makes "exactly one wins, the other 404s cleanly" the
// provable, catchable failure mode spec.md's advisory-lock design promises
// (never a 500, never both claiming success, never a state where the
// source's module/topic end up attached to neither target).

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

const dbName = `curr_merge_conc_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeCurricula } = await import("./curriculum.repo.js");

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

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
}

async function insertModule(moduleId: string, curriculumId: string, order: number): Promise<void> {
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`,
    [moduleId, curriculumId, "S3 module", order],
  );
}

async function insertTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, $5)`,
    [topicId, moduleId, curriculumId, "S3 topic", order],
  );
}

interface MergeOutcome {
  error?: string;
  targetCurriculumId?: string;
  sourceCurriculumId?: string;
  modulesMoved?: number;
  topicsMoved?: number;
  sourcesMoved?: number;
  socraticSessionsMoved?: number;
  probeSessionsMoved?: number;
}

function isSuccess(outcome: MergeOutcome): outcome is Required<
  Pick<
    MergeOutcome,
    "targetCurriculumId" | "sourceCurriculumId" | "modulesMoved" | "topicsMoved"
  >
> {
  return outcome.error === undefined;
}

describe("SCENARIO 3 — two concurrent merges racing for the same source curriculum", () => {
  it("exactly one merge succeeds with the moved counts, the other 404s cleanly, no partial/duplicated ownership of the source's module/topic", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S3 subject");

    const sourceId = id("s3-source");
    const targetBId = id("s3-target-b");
    const targetCId = id("s3-target-c");

    await insertCurriculum(sourceId, subjectId, "S3 Source");
    await insertCurriculum(targetBId, subjectId, "S3 Target B");
    await insertCurriculum(targetCId, subjectId, "S3 Target C");

    const moduleId = id("mod");
    await insertModule(moduleId, sourceId, 0);

    const topicId = id("top");
    await insertTopic(topicId, moduleId, sourceId, 0);

    const [resultB, resultC]: [MergeOutcome, MergeOutcome] = await Promise.all([
      mergeCurricula(targetBId, sourceId),
      mergeCurricula(targetCId, sourceId),
    ]);

    const outcomes = [resultB, resultC];
    const succeeded = outcomes.filter(isSuccess);
    const failed = outcomes.filter((o) => !isSuccess(o));

    // Non-negotiable per spec.md's Definition of Done: both promises must
    // resolve (never reject) — asserted as its own explicit check before any
    // row is inspected, so a swallowed exception can never masquerade as
    // "the other one just didn't finish".
    expect(outcomes).toHaveLength(2);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const winner = succeeded[0]!;
    expect(winner.modulesMoved).toBe(1);
    expect(winner.topicsMoved).toBe(1);
    expect(winner.sourceCurriculumId).toBe(sourceId);

    expect(failed[0]!.error).toBe("not_found");

    const winnerId = winner.targetCurriculumId;
    const loserId = winnerId === targetBId ? targetCId : targetBId;

    const { rows: winnerModules } = await client.query(
      `SELECT count(*)::int AS n FROM modules WHERE curriculum_id = $1`,
      [winnerId],
    );
    expect(winnerModules[0]!.n).toBe(1);

    const { rows: loserModules } = await client.query(
      `SELECT count(*)::int AS n FROM modules WHERE curriculum_id = $1`,
      [loserId],
    );
    expect(loserModules[0]!.n).toBe(0);

    const { rows: winnerTopics } = await client.query(
      `SELECT count(*)::int AS n FROM topics WHERE curriculum_id = $1`,
      [winnerId],
    );
    expect(winnerTopics[0]!.n).toBe(1);

    const { rows: loserTopics } = await client.query(
      `SELECT count(*)::int AS n FROM topics WHERE curriculum_id = $1`,
      [loserId],
    );
    expect(loserTopics[0]!.n).toBe(0);

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);

    const { rows: moduleRow } = await client.query(
      `SELECT curriculum_id FROM modules WHERE id = $1`,
      [moduleId],
    );
    expect(moduleRow[0]!.curriculum_id).toBe(winnerId);

    const { rows: topicRow } = await client.query(
      `SELECT curriculum_id FROM topics WHERE id = $1`,
      [topicId],
    );
    expect(topicRow[0]!.curriculum_id).toBe(winnerId);
  });

  it("a merge against a curriculum that no longer exists (already merged away) returns not_found without throwing", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S3 gone subject");

    const sourceId = id("s3-gone");
    const targetId = id("s3-gone-target");

    await insertCurriculum(sourceId, subjectId, "S3 Already Gone Source");
    await insertCurriculum(targetId, subjectId, "S3 Already Gone Target");

    await client.query(`DELETE FROM curricula WHERE id = $1`, [sourceId]);

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("not_found");
  });
});
