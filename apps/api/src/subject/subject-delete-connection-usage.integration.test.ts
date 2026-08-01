import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The resource-exhaustion half of the connection-nesting fix
// (docs/architecture/concurrency-and-verification-hardening/review.md's
// critical finding). `deleteSubject` holds one pooled connection for its whole
// run — the `withSubjectLock` transaction — and used to call a
// `deleteCurriculum` that took a SECOND connection from the same `max: 4`
// pool. With no `connectionTimeoutMillis` that is an unbounded wait, not an
// error, and the blocked callers are still holding subject advisory locks.
//
// Measured directly rather than argued about: the pool's connections are
// tagged with a per-run `application_name` (the technique
// practice/phrase-bank-cross-path-deadlock.integration.test.ts already uses),
// `deleteSubject` is parked mid-flight by a third connection holding the
// curriculum row with FOR UPDATE, and every connection this pool is holding at
// that instant is counted. `state <> 'idle'` is what "holding" means here:
// the lock transaction reads as 'idle in transaction' while it waits on
// JavaScript, the statement blocked on the row lock reads as 'active', and
// connections the pool merely keeps warm read as 'idle'.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the e2e
// docker-compose DB on localhost:5436, never mocked, DATABASE_URL asserted
// local-only before anything opens a connection.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const POOL_APP_NAME = `subj-del-conn-${randomUUID().slice(0, 8)}`;
const taggedUrl = new URL(BASE_DATABASE_URL);

taggedUrl.searchParams.set("application_name", POOL_APP_NAME);

process.env.DATABASE_URL = taggedUrl.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { deleteSubject } = await import("./subject.repo.js");

let client: pg.Client;
let blocker: pg.Client;

const createdSubjectIds: string[] = [];
const createdCurriculumIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: BASE_DATABASE_URL });
  blocker = new pg.Client({ connectionString: BASE_DATABASE_URL });
  await Promise.all([client.connect(), blocker.connect()]);
}, 30_000);

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM topics WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM modules WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM curricula WHERE subject_id = ANY($1)`, [createdSubjectIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await blocker?.end();
  await client?.end();
  await closeDb();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_delconn_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertCurriculum(subjectId: string, name: string): Promise<string> {
  const id = `cur_delconn_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    id,
    subjectId,
    name,
  ]);
  createdCurriculumIds.push(id);

  return id;
}

// Structure matters to what this measures: with modules and topics present,
// `deleteCurriculum` reaches `clearCurriculumStructure`'s own
// `db.transaction(...)` block, which on a handed-down transaction must become
// a SAVEPOINT on the same session rather than a fresh pool checkout. An empty
// curriculum returns at that function's early guard and never exercises it.
async function insertModuleWithTopic(curriculumId: string): Promise<void> {
  const moduleId = `mod_delconn_${randomUUID()}`;
  const topicId = `top_delconn_${randomUUID()}`;

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`,
    [moduleId, curriculumId],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'Topic', 0)`,
    [topicId, moduleId, curriculumId],
  );
}

async function countHeldPoolConnections(): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity
     WHERE application_name = $1 AND state IS DISTINCT FROM 'idle'`,
    [POOL_APP_NAME],
  );

  return rows[0]!.n as number;
}

async function waitForBlockedPoolConnection(): Promise<void> {
  const deadline = Date.now() + 20_000;

  for (;;) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE application_name = $1 AND wait_event_type = 'Lock'`,
      [POOL_APP_NAME],
    );

    if ((rows[0]!.n as number) > 0) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error(
        "deleteSubject never blocked on the held curriculum row — the measurement window never opened",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("deleteSubject connection footprint", () => {
  it("holds exactly one pooled connection while deleting a subject's curricula", async () => {
    const subjectId = await insertSubject("Connection Footprint Subject");
    const curriculumId = await insertCurriculum(subjectId, "Curriculum pinned by the blocker");

    await insertModuleWithTopic(curriculumId);

    await blocker.query("BEGIN");
    await blocker.query(`SELECT id FROM curricula WHERE id = $1 FOR UPDATE`, [curriculumId]);

    const deletePromise = deleteSubject(subjectId);

    await waitForBlockedPoolConnection();

    const held = await countHeldPoolConnections();

    await blocker.query("ROLLBACK");

    expect(await deletePromise).toBe(true);

    expect(held).toBe(1);
  }, 60_000);
});
