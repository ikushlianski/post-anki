import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// data-integrity-under-regeneration — "regenerate quiz" used to delete every
// probe_sessions row for a scope regardless of status, destroying completed,
// graded attempts along with the one stale unfinished session it actually
// meant to clear. deleteSessionsForScope now spares completed sessions.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `probe_regen_prov_${randomUUID().replace(/-/g, "_")}`;
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

const { deleteSessionsForScope } = await import("./probe-session.repo.js");

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

async function insertSession(
  sessionId: string,
  scope: string,
  scopeId: string,
  status: string,
): Promise<void> {
  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id, status, total, correct, answered)
     VALUES ($1, $2, $3, $4, 5, 5, 5)`,
    [sessionId, scope, scopeId, status],
  );
}

async function insertQuestion(sessionId: string): Promise<string> {
  const questionId = id("psq");

  await client.query(
    `INSERT INTO probe_session_questions
       (id, session_id, "order", prompt, options, correct_answer_index)
     VALUES ($1, $2, 0, 'prompt', '["a","b"]'::jsonb, 0)`,
    [questionId, sessionId],
  );

  return questionId;
}

async function sessionExists(sessionId: string): Promise<boolean> {
  const { rows } = await client.query(`SELECT id FROM probe_sessions WHERE id = $1`, [
    sessionId,
  ]);

  return rows.length > 0;
}

async function questionExists(questionId: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT id FROM probe_session_questions WHERE id = $1`,
    [questionId],
  );

  return rows.length > 0;
}

describe("deleteSessionsForScope spares completed quiz history on regenerate", () => {
  it("keeps a completed session's answers while clearing the stale active one", async () => {
    const scopeId = id("top");

    const completedSessionId = id("psess");
    await insertSession(completedSessionId, "topic", scopeId, "completed");
    const completedQuestionId = await insertQuestion(completedSessionId);

    const activeSessionId = id("psess");
    await insertSession(activeSessionId, "topic", scopeId, "active");
    const activeQuestionId = await insertQuestion(activeSessionId);

    await deleteSessionsForScope("topic", scopeId);

    expect(await sessionExists(completedSessionId)).toBe(true);
    expect(await questionExists(completedQuestionId)).toBe(true);
    expect(await sessionExists(activeSessionId)).toBe(false);
    expect(await questionExists(activeQuestionId)).toBe(false);
  });
});
