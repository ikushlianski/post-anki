import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Issue #27, spec.md Decision 6 / AC 24-26 — the real-Postgres proof that
// `/done` and the inactivity sweep can race on the same idle session
// without double-completing it or double-sending a summary. Mirrors
// gap-mastery-concurrency.integration.test.ts's harness exactly: real
// Postgres via DATABASE_URL/E2E_DATABASE_URL, assertLocalDbTarget guard, a
// dedicated throwaway database per run.
//
// Non-negotiable per that precedent's own Definition of Done: both
// concurrent calls must resolve successfully (Promise.all, never
// Promise.allSettled) as its own assertion BEFORE any row is inspected — a
// test that tolerated one call silently failing would pass vacuously even
// with no CAS guard at all.

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

const dbName = `socratic_completion_race_${randomUUID().replace(/-/g, "_")}`;
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

const { completeSessionNow } = await import("./socratic.service.js");

let client: pg.Client;

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

interface Scenery {
  sessionId: string;
}

async function seedScenery(): Promise<Scenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const sessionId = id("ssess");
  const turnId = id("sturn");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Completion race test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Completion race test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Completion race test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Completion race test topic"],
  );
  await client.query(
    `INSERT INTO socratic_sessions (id, topic_id, curriculum_id, status)
     VALUES ($1, $2, $3, 'active')`,
    [sessionId, topicId, curriculumId],
  );
  await client.query(
    `INSERT INTO socratic_turns
       (id, session_id, concept_label, "order", prompt, answer, degree, action, answered_at)
     VALUES ($1, $2, 'Server functions', 1, 'Explain it.', 'yes', 'correct', 'advance', now())`,
    [turnId, sessionId],
  );

  return { sessionId };
}

describe("SCENARIO 4 — /done and the inactivity sweep race on the same idle session (AC 24-26)", () => {
  it("exactly one of two concurrent completeSessionNow calls performs the transition and returns a summary", async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    const scenery = await seedScenery();
    const now = new Date().toISOString();

    const [resultA, resultB] = await Promise.all([
      completeSessionNow(scenery.sessionId, now),
      completeSessionNow(scenery.sessionId, now),
    ]);

    expect(resultA).not.toHaveProperty("error");
    expect(resultB).not.toHaveProperty("error");

    if ("error" in resultA || "error" in resultB) {
      throw new Error("unreachable");
    }

    const winners = [resultA, resultB].filter((r) => r.completed);
    const losers = [resultA, resultB].filter((r) => !r.completed);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]!.summary).not.toBeNull();
    expect(losers[0]!.summary).toBeNull();

    const { rows } = await client.query(
      `SELECT status FROM socratic_sessions WHERE id = $1`,
      [scenery.sessionId],
    );

    expect(rows[0]?.status).toBe("completed");
  }, 30_000);

  it("the pre-existing natural-completion caller is unaffected by the new WHERE status='active' clause (AC 26)", async () => {
    const scenery = await seedScenery();

    const { completeSocraticSession } = await import("./socratic.repo.js");
    const updated = await completeSocraticSession(scenery.sessionId, new Date().toISOString());

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("completed");
  }, 30_000);
});
