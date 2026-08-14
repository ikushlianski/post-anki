import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Issue #27, spec.md Decision 5 / AC 18-19 — the real-Postgres proof for the
// 30-minute inactivity check, seeding a pending turn's created_at genuinely
// in the past (rather than mocking Date.now/sleeping) so the elapsed-time
// arithmetic runs against real timestamp columns. Mirrors
// probe-session-replenish.integration.test.ts's harness shape.

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

const dbName = `socratic_check_idle_${randomUUID().replace(/-/g, "_")}`;
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

const { checkSessionIdle } = await import("./socratic.service.js");

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

async function seedScenery(pendingCreatedAt: Date): Promise<Scenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const sessionId = id("ssess");
  const answeredTurnId = id("sturn");
  const pendingTurnId = id("sturn");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Check-idle test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Check-idle test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Check-idle test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Check-idle test topic"],
  );
  await client.query(
    `INSERT INTO socratic_sessions (id, topic_id, curriculum_id, status)
     VALUES ($1, $2, $3, 'active')`,
    [sessionId, topicId, curriculumId],
  );
  await client.query(
    `INSERT INTO socratic_turns
       (id, session_id, concept_label, "order", prompt, answer, degree, action, created_at, answered_at)
     VALUES ($1, $2, 'Loaders', 1, 'Explain loaders.', 'yes', 'correct', 'advance', $3, $3)`,
    [answeredTurnId, sessionId, new Date(pendingCreatedAt.getTime() - 10 * 60 * 1000)],
  );
  await client.query(
    `INSERT INTO socratic_turns
       (id, session_id, concept_label, "order", prompt, created_at)
     VALUES ($1, $2, 'Server functions', 2, 'Explain a server function.', $3)`,
    [pendingTurnId, sessionId, pendingCreatedAt],
  );

  return { sessionId };
}

describe("SCENARIO 3 — a discussion goes quiet and the sweep closes it 30 minutes later (AC 18, 19)", () => {
  it("returns idle:false and performs no write when the pending turn is under 30 minutes old (AC 18)", async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    const pendingCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
    const scenery = await seedScenery(pendingCreatedAt);

    const result = await checkSessionIdle(scenery.sessionId, new Date().toISOString());

    expect(result).toEqual({ idle: false });

    const { rows } = await client.query(
      `SELECT status FROM socratic_sessions WHERE id = $1`,
      [scenery.sessionId],
    );

    expect(rows[0]?.status).toBe("active");
  }, 30_000);

  it("completes the session and returns a summary once the pending turn is 30+ minutes old (AC 19)", async () => {
    const pendingCreatedAt = new Date(Date.now() - 31 * 60 * 1000);
    const scenery = await seedScenery(pendingCreatedAt);

    const result = await checkSessionIdle(scenery.sessionId, new Date().toISOString());

    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.idle).toBe(true);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.solidConcepts).toEqual(["Loaders"]);

    const { rows } = await client.query(
      `SELECT status FROM socratic_sessions WHERE id = $1`,
      [scenery.sessionId],
    );

    expect(rows[0]?.status).toBe("completed");
  }, 30_000);
});
