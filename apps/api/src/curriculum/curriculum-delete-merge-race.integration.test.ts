import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The deleteCurriculum-vs-mergeCurricula race (.planning/TODO.md —
// "deleteCurriculum takes no advisory lock, can interleave with a
// concurrent mergeCurricula"). The curriculum-level sibling of
// subject/subject-delete-merge-race.integration.test.ts, constructed the
// same deliberate way rather than raced for: a second connection parks the
// real mergeCurricula on its `DELETE FROM curricula` with `SELECT ... FOR
// UPDATE`, which leaves the merge holding both advisory locks with its
// reassignment UPDATEs already executed but uncommitted — precisely the
// window — and deleteCurriculum is fired into it.
//
// Two directions matter, and they break differently:
//   * delete the merge TARGET — before the fix this ran unlocked, so it
//     could commit its own DELETE FROM curricula while the merge's
//     uncommitted module UPDATE is still in flight; once the merge commits
//     that module row points at a curriculum id that no longer exists.
//   * delete the merge SOURCE — before the fix this could clear the
//     source's own module rows (curriculum_id = sourceId) before the merge's
//     UPDATE reassigns them to the target, silently losing the content the
//     merge was meant to preserve.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the
// e2e docker-compose DB on localhost:5436, never mocked, DATABASE_URL
// asserted local-only before anything opens a connection.

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

const dbName = `curr_del_merge_race_${randomUUID().replace(/-/g, "_")}`;
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

const { deleteCurriculum, mergeCurricula } = await import("./curriculum.repo.js");

let client: pg.Client;
let pauseClient: pg.Client;

const createdSubjectIds: string[] = [];
const createdCurriculumIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  pauseClient = new pg.Client({ connectionString: DATABASE_URL });
  await pauseClient.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdCurriculumIds.length > 0) {
    await client.query(`DELETE FROM modules WHERE curriculum_id = ANY($1)`, [
      createdCurriculumIds,
    ]);
    await client.query(`DELETE FROM curricula WHERE id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await pauseClient?.end();
  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_curdelrace_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertCurriculum(subjectId: string, name: string): Promise<string> {
  const id = `cur_curdelrace_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    id,
    subjectId,
    name,
  ]);
  createdCurriculumIds.push(id);

  return id;
}

async function insertModule(curriculumId: string, title: string): Promise<string> {
  const id = `mod_curdelrace_${randomUUID()}`;

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [id, curriculumId, title],
  );

  return id;
}

async function countModulesFor(curriculumId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM modules WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows[0]!.n as number;
}

async function moduleCurriculumId(moduleId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT curriculum_id FROM modules WHERE id = $1`, [
    moduleId,
  ]);

  return rows.length === 0 ? null : (rows[0]!.curriculum_id as string);
}

async function countCurriculumRows(curriculumId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM curricula WHERE id = $1`, [
    curriculumId,
  ]);

  return rows[0]!.n as number;
}

// Blocks until the merge transaction is genuinely parked on its
// `DELETE FROM curricula` — polling the server's own wait state rather than
// sleeping a guessed interval, so the window is proven open before the
// racing delete is fired into it.
async function waitForBlockedCurriculumDelete(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query ILIKE '%delete from "curricula"%'`,
    );

    if ((rows[0]!.n as number) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("merge never blocked on DELETE FROM curricula — the race window never opened");
}

interface MergeOutcome {
  error?: string;
  modulesMoved?: number;
}

describe("deleteCurriculum racing a concurrent curriculum merge", () => {
  it("never leaves a module under the merge target it deleted", async () => {
    const subjectId = await insertSubject("Curriculum Delete Race Subject A");
    const sourceId = await insertCurriculum(subjectId, "Delete Race Source");
    const targetId = await insertCurriculum(subjectId, "Delete Race Target");
    const moduleId = await insertModule(sourceId, "Module being merged across");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM curricula WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeCurricula(targetId, sourceId) as Promise<MergeOutcome>;

    await waitForBlockedCurriculumDelete();

    // Window proof: the merge's reassignment UPDATE has run but is not yet
    // visible, so any other session still reads the module as the source's.
    // Without this the test could pass vacuously by never actually reaching
    // the racy interleaving.
    expect(await countModulesFor(sourceId)).toBe(1);
    expect(await countModulesFor(targetId)).toBe(0);

    const deletePromise = deleteCurriculum(targetId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [mergeResult, deleteResult] = await Promise.all([mergePromise, deletePromise]);

    expect(mergeResult.error).toBeUndefined();
    expect(deleteResult).toBe(true);

    expect(await countCurriculumRows(sourceId)).toBe(0);
    expect(await countCurriculumRows(targetId)).toBe(0);

    // The whole point: no module row outlives the curriculum it points at.
    expect(await countModulesFor(targetId)).toBe(0);
    expect(await countModulesFor(sourceId)).toBe(0);
    expect(await moduleCurriculumId(moduleId)).toBeNull();
  }, 60_000);

  it("does not destroy a module the merge is handing to the target", async () => {
    const subjectId = await insertSubject("Curriculum Delete Race Subject B");
    const sourceId = await insertCurriculum(subjectId, "Delete Race Source B");
    const targetId = await insertCurriculum(subjectId, "Delete Race Target B");
    const moduleId = await insertModule(sourceId, "Module the merge is saving");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM curricula WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeCurricula(targetId, sourceId) as Promise<MergeOutcome>;

    await waitForBlockedCurriculumDelete();

    expect(await countModulesFor(sourceId)).toBe(1);

    const deletePromise = deleteCurriculum(sourceId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [mergeResult, deleteResult] = await Promise.all([mergePromise, deletePromise]);

    expect(mergeResult.error).toBeUndefined();
    expect(mergeResult.modulesMoved).toBe(1);

    // The merge won the lock and deleted the source itself, so the delete
    // finds nothing left to do and says so instead of half-applying.
    expect(deleteResult).toBe(false);

    expect(await countCurriculumRows(sourceId)).toBe(0);
    expect(await countCurriculumRows(targetId)).toBe(1);
    expect(await moduleCurriculumId(moduleId)).toBe(targetId);
  }, 60_000);

  it("still deletes a curriculum and its modules when no merge is in flight", async () => {
    const subjectId = await insertSubject("Curriculum Delete Race Subject C");
    const curriculumId = await insertCurriculum(subjectId, "Uncontended Delete Curriculum");
    const moduleId = await insertModule(curriculumId, "Ordinary module");

    expect(await deleteCurriculum(curriculumId)).toBe(true);

    expect(await countCurriculumRows(curriculumId)).toBe(0);
    expect(await moduleCurriculumId(moduleId)).toBeNull();
  }, 30_000);

  it("returns false for a curriculum that was already merged away", async () => {
    const subjectId = await insertSubject("Curriculum Delete Race Subject D");
    const sourceId = await insertCurriculum(subjectId, "Already Merged Delete Source");
    const targetId = await insertCurriculum(subjectId, "Already Merged Delete Target");

    const mergeResult = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    expect(await deleteCurriculum(sourceId)).toBe(false);
  }, 30_000);
});
