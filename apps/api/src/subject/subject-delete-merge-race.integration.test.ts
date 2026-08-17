import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The deleteSubject-vs-merge race (.planning/todo.md — "Residual, NOT fixed
// here: deleteSubject() has the same orphan window as the merge did"). The
// sibling of the createCurriculum race next door in
// curriculum/curriculum-create-merge-race.integration.test.ts, and constructed
// the same deliberate way rather than raced for: a second connection parks the
// real mergeSubjects on its `DELETE FROM subjects` with `SELECT ... FOR
// UPDATE`, which leaves the merge holding both advisory locks with its two
// reassignment UPDATEs already executed but uncommitted — precisely the window
// — and deleteSubject is fired into it.
//
// Two directions matter, and they break differently:
//   * delete the merge TARGET — the delete enumerates the target's curricula
//     before the merge's uncommitted UPDATE is visible, so it deletes the
//     subject row while a curriculum is about to be moved underneath it, and
//     that curriculum survives its own parent.
//   * delete the merge SOURCE — the delete sees the source's curricula still
//     under the source (the UPDATE is invisible), and destroys a curriculum
//     the merge is in the middle of handing to the target.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the e2e
// docker-compose DB on localhost:5436, never mocked, DATABASE_URL asserted
// local-only before anything opens a connection.

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

const dbName = `subj_del_merge_race_${randomUUID().replace(/-/g, "_")}`;
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

const { deleteSubject, mergeSubjects } = await import("./subject.repo.js");

let client: pg.Client;
let pauseClient: pg.Client;

const createdSubjectIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  pauseClient = new pg.Client({ connectionString: DATABASE_URL });
  await pauseClient.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM curricula WHERE subject_id = ANY($1)`, [createdSubjectIds]);
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
  const id = `sub_delrace_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertCurriculum(subjectId: string, name: string): Promise<string> {
  const id = `cur_delrace_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    id,
    subjectId,
    name,
  ]);

  return id;
}

async function countCurriculaFor(subjectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM curricula WHERE subject_id = $1`,
    [subjectId],
  );

  return rows[0]!.n as number;
}

async function curriculumSubjectId(curriculumId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT subject_id FROM curricula WHERE id = $1`, [
    curriculumId,
  ]);

  return rows.length === 0 ? null : (rows[0]!.subject_id as string);
}

async function countSubjectRows(subjectId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM subjects WHERE id = $1`, [
    subjectId,
  ]);

  return rows[0]!.n as number;
}

// Blocks until the merge transaction is genuinely parked on its
// `DELETE FROM subjects` — polling the server's own wait state rather than
// sleeping a guessed interval, so the window is proven open before the racing
// delete is fired into it.
async function waitForBlockedSubjectDelete(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query ILIKE '%delete from "subjects"%'`,
    );

    if ((rows[0]!.n as number) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("merge never blocked on DELETE FROM subjects — the race window never opened");
}

interface MergeOutcome {
  error?: string;
  curriculaMoved?: number;
}

describe("deleteSubject racing a concurrent subject merge", () => {
  it("never leaves a curriculum under the merge target it deleted", async () => {
    const sourceId = await insertSubject("Delete Race Source");
    const targetId = await insertSubject("Delete Race Target");
    const curriculumId = await insertCurriculum(sourceId, "Curriculum being merged across");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM subjects WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeSubjects(targetId, sourceId) as Promise<MergeOutcome>;

    await waitForBlockedSubjectDelete();

    // Window proof: the merge's reassignment UPDATE has run but is not yet
    // visible, so any other session still reads the curriculum as the
    // source's. Without this the test could pass vacuously by never actually
    // reaching the racy interleaving.
    expect(await countCurriculaFor(sourceId)).toBe(1);
    expect(await countCurriculaFor(targetId)).toBe(0);

    const deletePromise = deleteSubject(targetId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [mergeResult, deleteResult] = await Promise.all([mergePromise, deletePromise]);

    expect(mergeResult.error).toBeUndefined();
    expect(deleteResult).toBe(true);

    expect(await countSubjectRows(sourceId)).toBe(0);
    expect(await countSubjectRows(targetId)).toBe(0);

    // The whole point: no curriculum row outlives the subject it points at.
    expect(await countCurriculaFor(targetId)).toBe(0);
    expect(await countCurriculaFor(sourceId)).toBe(0);
    expect(await curriculumSubjectId(curriculumId)).toBeNull();
  }, 60_000);

  it("does not destroy a curriculum the merge is handing to the target", async () => {
    const sourceId = await insertSubject("Delete Race Source B");
    const targetId = await insertSubject("Delete Race Target B");
    const curriculumId = await insertCurriculum(sourceId, "Curriculum the merge is saving");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM subjects WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeSubjects(targetId, sourceId) as Promise<MergeOutcome>;

    await waitForBlockedSubjectDelete();

    expect(await countCurriculaFor(sourceId)).toBe(1);

    const deletePromise = deleteSubject(sourceId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [mergeResult, deleteResult] = await Promise.all([mergePromise, deletePromise]);

    expect(mergeResult.error).toBeUndefined();
    expect(mergeResult.curriculaMoved).toBe(1);

    // The merge won the lock and deleted the source itself, so the delete
    // finds nothing left to do and says so instead of half-applying.
    expect(deleteResult).toBe(false);

    expect(await countSubjectRows(sourceId)).toBe(0);
    expect(await countSubjectRows(targetId)).toBe(1);
    expect(await curriculumSubjectId(curriculumId)).toBe(targetId);
  }, 60_000);

  it("still deletes a subject and its curricula when no merge is in flight", async () => {
    const subjectId = await insertSubject("Uncontended Delete Subject");
    const curriculumId = await insertCurriculum(subjectId, "Ordinary curriculum");

    expect(await deleteSubject(subjectId)).toBe(true);

    expect(await countSubjectRows(subjectId)).toBe(0);
    expect(await curriculumSubjectId(curriculumId)).toBeNull();
  }, 30_000);

  it("returns false for a subject that was already merged away", async () => {
    const sourceId = await insertSubject("Already Merged Delete Source");
    const targetId = await insertSubject("Already Merged Delete Target");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    expect(await deleteSubject(sourceId)).toBe(false);
  }, 30_000);
});
