import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Found by `/debrief` (docs/architecture/curriculum-merge/review.md): a
// failed curriculum's "Retry research"/"Reparse" recovery action calls
// clearCurriculumStructure(), which deletes every module/topic currently
// under that curriculum id with no concept of how they got there — merging
// real content into a failed curriculum, then later retrying it, silently
// destroys that content with no timing coincidence required. This test
// proves the fix: mergeCurricula refuses a target sitting at status
// 'failed' outright, before any reassignment happens.

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

const dbName = `curr_merge_failed_${randomUUID().replace(/-/g, "_")}`;
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

async function insertModule(moduleId: string, curriculumId: string, title: string): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 0)`, [
    moduleId,
    curriculumId,
    title,
  ]);
}

interface MergeOutcome {
  error?: string;
  modulesMoved?: number;
}

describe("target_failed precondition — a failed curriculum can never be a merge target", () => {
  it("rejects the merge with target_failed and moves nothing when the target is status='failed'", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "target-failed subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Failed Target", "failed");
    await insertCurriculum(sourceId, subjectId, "Healthy Source", "ready");

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId, "Real content that must not be lost");

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("target_failed");

    // Fully rejected, not partially applied — the source's module is still
    // under the source, and the source curriculum still exists.
    const { rows: moduleRows } = await client.query(
      `SELECT curriculum_id FROM modules WHERE id = $1`,
      [sourceModuleId],
    );
    expect(moduleRows[0]!.curriculum_id).toBe(sourceId);

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(1);
  });

  it("allows the merge when the SOURCE is status='failed' (only the target is gated)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "source-failed subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Healthy Target", "ready");
    await insertCurriculum(sourceId, subjectId, "Failed Source", "failed");

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId, "Content from a failed source");

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.modulesMoved).toBe(1);

    const { rows: moduleRows } = await client.query(
      `SELECT curriculum_id FROM modules WHERE id = $1`,
      [sourceModuleId],
    );
    expect(moduleRows[0]!.curriculum_id).toBe(targetId);
  });

  it("allows the merge when both curricula are healthy (regression check)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "healthy-pair subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "Target", "ready");
    await insertCurriculum(sourceId, subjectId, "Source", "ready");

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
  });
});
