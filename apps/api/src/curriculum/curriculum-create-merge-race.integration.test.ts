import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The createCurriculum-vs-merge race (.planning/wishlist.md — "Close the
// createCurriculum-vs-merge race"). mergeSubjects reassigns the source's
// curricula and THEN deletes the source subject row; a curriculum created in
// between those two statements used to be reassigned by neither and left
// pointing at a subject id that no longer exists.
//
// The interleaving here is constructed deliberately, not raced for: a second
// connection takes `SELECT ... FOR UPDATE` on the source subject row, which
// lets the real mergeSubjects run its two reassignment UPDATEs and then block
// on its own `DELETE FROM subjects` — precisely the window — while still
// holding both of its advisory locks. createCurriculum is fired into that
// window, the row lock is released, and both outcomes are inspected.
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

const dbName = `curr_create_race_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeSubjects } = await import("../subject/subject.repo.js");
const { createCurriculum } = await import("./curriculum.repo.js");

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
  const id = `sub_race_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function countCurriculaFor(subjectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM curricula WHERE subject_id = $1`,
    [subjectId],
  );

  return rows[0]!.n as number;
}

// Blocks until the merge transaction is genuinely parked on its
// `DELETE FROM subjects` — polling the server's own wait state rather than
// sleeping a guessed interval, so the window is proven open before the
// racing create is fired into it.
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

interface CreateOutcome {
  error?: string;
  id?: string;
  subjectId?: string;
}

interface MergeOutcome {
  error?: string;
  curriculaMoved?: number;
}

describe("createCurriculum racing a concurrent subject merge", () => {
  it("never lands a curriculum under the source subject the merge is deleting", async () => {
    const sourceId = await insertSubject("Race Source");
    const targetId = await insertSubject("Race Target");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM subjects WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeSubjects(targetId, sourceId) as Promise<MergeOutcome>;

    await waitForBlockedSubjectDelete();

    const createPromise = createCurriculum({
      subjectId: sourceId,
      name: "Curriculum created mid-merge",
      sources: [],
    }) as Promise<CreateOutcome>;

    // Long enough that an unserialized create would have committed its INSERT
    // by now — without this settle window the test could pass vacuously by
    // simply never reaching the racy statement.
    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [mergeResult, createResult] = await Promise.all([mergePromise, createPromise]);

    expect(mergeResult.error).toBeUndefined();

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM subjects WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);

    // The whole point: zero orphans pointing at the deleted source subject.
    expect(await countCurriculaFor(sourceId)).toBe(0);

    expect(createResult.error).toBe("subject_not_found");
    expect(createResult.id).toBeUndefined();
  }, 60_000);

  it("returns subject_not_found instead of inserting when the subject was already merged away", async () => {
    const sourceId = await insertSubject("Already Merged Source");
    const targetId = await insertSubject("Already Merged Target");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const result = (await createCurriculum({
      subjectId: sourceId,
      name: "Curriculum for a subject that no longer exists",
      sources: [],
    })) as CreateOutcome;

    expect(result.error).toBe("subject_not_found");
    expect(await countCurriculaFor(sourceId)).toBe(0);
  }, 30_000);

  it("still creates normally when no merge is in flight", async () => {
    const subjectId = await insertSubject("Uncontended Subject");

    const result = (await createCurriculum({
      subjectId,
      name: "Ordinary curriculum",
      sources: [],
    })) as CreateOutcome;

    expect(result.error).toBeUndefined();
    expect(result.subjectId).toBe(subjectId);
    expect(await countCurriculaFor(subjectId)).toBe(1);
  }, 30_000);
});
