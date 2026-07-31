import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// course-priority-drag-reorder (issue #69), SCENARIOS 1/5/6 — proves
// reorderCurricula's exact-id-set validation (Scenario 5: a foreign id or an
// omitted id rejects the whole request with zero rows touched), that its
// write path genuinely runs inside db.transaction() (a forced mid-loop
// failure must leave zero rows changed, not a partial renumbering — the
// exact corrupted state Scenario 5's validation exists to prevent, just
// triggered by a write failure instead of a bad payload), and that
// listCurricula() orders by (subjectId, order) (Scenario 1/6).
//
// Same fresh-migrated-throwaway-Postgres technique as decide.repo.test.ts:
// real inserts/selects/transactions against a real Postgres instance, not a
// mocked repo shape — a mid-transaction rollback can only be proven against
// a real transaction.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's
// Backend DoD pins this precise command
// `npx vitest run apps/api/src/curriculum/curriculum.repo.test.ts`;
// vitest.config.ts's exclude list carries this filename as a named
// exception, same as decide.repo.test.ts / decide.orchestrator.test.ts.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `curriculum_repo_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;
let client: pg.Client;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: testDatabaseUrl });
  const migrateDb = drizzle(migratePool);

  await migrate(migrateDb, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

  client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
}, 60_000);

afterAll(async () => {
  await client?.end();

  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

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
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, "order") VALUES ($1, $2, $3, $4)`,
    [curriculumId, subjectId, name, order],
  );
}

async function orderOf(curriculumId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT "order" FROM curricula WHERE id = $1`,
    [curriculumId],
  );

  return rows[0].order;
}

describe("reorderCurricula — SCENARIO 5 (exact id-set validation, all-or-nothing)", () => {
  it("rejects a payload containing an id from a different subject and writes zero rows", async () => {
    const { reorderCurricula } = await import("./curriculum.repo.js");

    const subjectId = id("sub");
    await insertSubject(subjectId, "S5 subject A");
    const c1 = id("cur");
    const c2 = id("cur");
    await insertCurriculum(c1, subjectId, "S5 course 1", 1);
    await insertCurriculum(c2, subjectId, "S5 course 2", 2);

    const otherSubjectId = id("sub");
    await insertSubject(otherSubjectId, "S5 subject B");
    const foreignId = id("cur");
    await insertCurriculum(foreignId, otherSubjectId, "S5 foreign course", 1);

    const result = await reorderCurricula(subjectId, [c1, foreignId]);

    expect(result).toEqual({ error: "invalid_id_set" });
    expect(await orderOf(c1)).toBe(1);
    expect(await orderOf(c2)).toBe(2);
    expect(await orderOf(foreignId)).toBe(1);
  });

  it("rejects a payload that omits one of the subject's existing course ids and writes zero rows", async () => {
    const { reorderCurricula } = await import("./curriculum.repo.js");

    const subjectId = id("sub");
    await insertSubject(subjectId, "S5 subject C");
    const c1 = id("cur");
    const c2 = id("cur");
    const c3 = id("cur");
    await insertCurriculum(c1, subjectId, "S5 course 1", 1);
    await insertCurriculum(c2, subjectId, "S5 course 2", 2);
    await insertCurriculum(c3, subjectId, "S5 course 3", 3);

    const result = await reorderCurricula(subjectId, [c2, c1]);

    expect(result).toEqual({ error: "invalid_id_set" });
    expect(await orderOf(c1)).toBe(1);
    expect(await orderOf(c2)).toBe(2);
    expect(await orderOf(c3)).toBe(3);
  });

  it("accepts an exact id-set match and reassigns sequential order", async () => {
    const { reorderCurricula } = await import("./curriculum.repo.js");

    const subjectId = id("sub");
    await insertSubject(subjectId, "S5 subject D");
    const c1 = id("cur");
    const c2 = id("cur");
    const c3 = id("cur");
    await insertCurriculum(c1, subjectId, "S5 course 1", 1);
    await insertCurriculum(c2, subjectId, "S5 course 2", 2);
    await insertCurriculum(c3, subjectId, "S5 course 3", 3);

    const result = await reorderCurricula(subjectId, [c3, c1, c2]);

    expect(result).toEqual({ reordered: 3 });
    expect(await orderOf(c3)).toBe(1);
    expect(await orderOf(c1)).toBe(2);
    expect(await orderOf(c2)).toBe(3);
  });
});

describe("reorderCurricula — write path runs inside db.transaction() (mid-loop failure leaves zero rows changed)", () => {
  it("a forced constraint violation partway through the write rolls back every row in the batch, not just the failing one", async () => {
    const { reorderCurricula } = await import("./curriculum.repo.js");

    const subjectId = id("sub");
    await insertSubject(subjectId, "S-tx subject");
    const c1 = id("cur");
    const c2 = id("cur");
    const c3 = id("cur");
    await insertCurriculum(c1, subjectId, "S-tx course 1", 1);
    await insertCurriculum(c2, subjectId, "S-tx course 2", 2);
    await insertCurriculum(c3, subjectId, "S-tx course 3", 3);

    // Forces exactly the second write in the loop to fail: assignOrders
    // assigns [c3, c1, c2] -> c3=1, c1=2, c2=3, so this guard blocks the
    // c1 write specifically, after c3's write has already gone through
    // inside the (uncommitted) transaction.
    // NOT VALID: only new writes are checked against the constraint, so
    // adding it doesn't fail on other tests' pre-existing rows elsewhere in
    // this shared throwaway database that happen to already hold order = 2.
    await client.query(
      `ALTER TABLE curricula ADD CONSTRAINT curricula_order_test_guard CHECK ("order" <> 2) NOT VALID`,
    );

    try {
      await expect(reorderCurricula(subjectId, [c3, c1, c2])).rejects.toThrow();

      // If the write loop were an unwrapped sequential loop (reorderModules'
      // pattern) instead of db.transaction(), c3's write would have already
      // committed before the failing c1 write threw — leaving c3 renumbered
      // to 1 while c1/c2 kept their stale values. Asserting all three are
      // still exactly their pre-call values proves the whole batch rolled
      // back together, not just that the failing statement itself failed.
      expect(await orderOf(c1)).toBe(1);
      expect(await orderOf(c2)).toBe(2);
      expect(await orderOf(c3)).toBe(3);
    } finally {
      await client.query(`ALTER TABLE curricula DROP CONSTRAINT curricula_order_test_guard`);
    }
  });
});

describe("listCurricula — SCENARIO 1/6 (ordered by subjectId, then order)", () => {
  it("returns rows ordered by (subjectId, order), grouping each subject's courses together in ascending order", async () => {
    const { listCurricula } = await import("./curriculum.repo.js");

    const subjectId = id("sub");
    await insertSubject(subjectId, "S-list subject");
    const c1 = id("cur");
    const c2 = id("cur");
    const c3 = id("cur");
    // Inserted out of order on purpose — listCurricula must sort by the
    // `order` column, not insertion/created_at order.
    await insertCurriculum(c2, subjectId, "S-list course 2", 2);
    await insertCurriculum(c1, subjectId, "S-list course 1", 1);
    await insertCurriculum(c3, subjectId, "S-list course 3", 3);

    const rows = await listCurricula(subjectId);
    const ids = rows.map((r) => r.id);

    expect(ids).toEqual([c1, c2, c3]);
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3]);
  });
});
