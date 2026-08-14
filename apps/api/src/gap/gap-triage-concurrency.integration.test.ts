import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 9 (.planning/2026-08-14-gap-triage/scenarios.md), AC30 — two
// near-simultaneous POST /gaps/:id/triage calls for the same gap (duplicate
// webhook delivery, or a genuine fast double-tap) must resolve to exactly
// one `changed: true` and one `changed: false`, with the DB ending in
// exactly one coherent state and no double-write artifact. Harness mirrors
// apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts
// exactly: dedicated throwaway Postgres database, real transaction, no
// mocked DB layer, both calls' resolution asserted BEFORE any row is
// inspected (this repo's Definition-of-Done convention for concurrency
// tests — a test tolerating one call silently failing would pass vacuously
// even with no lock at all).

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

const dbName = `gap_triage_conc_${randomUUID().replace(/-/g, "_")}`;
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

const { triageGapLocked } = await import("./gap-triage.repo.js");

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

async function seedScenery(): Promise<{ topicId: string; gapId: string }> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Concurrency triage test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Concurrency triage test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Concurrency triage test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Concurrency triage test topic"],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, "Concurrency triage test gap"],
  );

  return { topicId, gapId };
}

describe("SCENARIO 9 — two concurrent triage taps for the same gap don't corrupt state", () => {
  it("both concurrent POST /gaps/:id/triage calls resolve, exactly one changed:true, DB ends coherent, deferralCount unaffected by an important tap", async () => {
    const { gapId } = await seedScenery();
    const now = new Date().toISOString();

    const [resultA, resultB] = await Promise.all([
      triageGapLocked(gapId, "important", now),
      triageGapLocked(gapId, "important", now),
    ]);

    // Both calls must resolve to a real result object — asserted BEFORE any
    // row is inspected, per the Definition of Done.
    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();

    const changedFlags = [resultA!.changed, resultB!.changed].sort();

    expect(changedFlags).toEqual([false, true]);

    const { rows } = await client.query(
      `SELECT triage_state, deferral_count FROM gaps WHERE id = $1`,
      [gapId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.triage_state).toBe("important");
    expect(Number(rows[0]!.deferral_count)).toBe(0);
  }, 30_000);

  it("two concurrent defer taps increment deferralCount by exactly one, not two", async () => {
    const { gapId } = await seedScenery();
    const now = new Date().toISOString();

    const [resultA, resultB] = await Promise.all([
      triageGapLocked(gapId, "defer", now),
      triageGapLocked(gapId, "defer", now),
    ]);

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();

    const { rows } = await client.query(`SELECT deferral_count FROM gaps WHERE id = $1`, [
      gapId,
    ]);

    expect(Number(rows[0]!.deferral_count)).toBe(1);
  }, 30_000);
});
