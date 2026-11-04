import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `study_session_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const {
  insertStudySession,
  startStudySession,
  recordStudySessionAnswer,
  endStudySession,
  getStudySession,
  listStudySessions,
} = await import("./study-session.repo.js");

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

async function newSession(): Promise<string> {
  const created = await insertStudySession({ plannedDurationMinutes: 20 });

  await startStudySession(created.id, new Date());

  return created.id;
}

describe("study session counters and ending (real Postgres)", () => {
  it("should count every answer when many arrive at the same time", async () => {
    const id = await newSession();

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => recordStudySessionAnswer(id, index % 2 === 0)),
    );

    const stored = await getStudySession(id);

    expect(stored?.questionsAnswered).toBe(20);
    expect(stored?.questionsCorrect).toBe(10);
  });

  it("should keep the first end result when a session is ended twice", async () => {
    const id = await newSession();

    await recordStudySessionAnswer(id, true);

    const firstEnd = new Date("2026-01-01T10:00:00.000Z");
    const first = await endStudySession(id, firstEnd);
    const second = await endStudySession(id, new Date("2026-01-01T11:00:00.000Z"));

    expect(first?.status).toBe("completed");
    expect(second?.status).toBe("completed");
    expect(second?.completedAt).toBe(firstEnd.toISOString());
  });

  it("should keep a session with no answers abandoned even if an answer arrives later", async () => {
    const id = await newSession();

    const first = await endStudySession(id, new Date("2026-01-01T10:00:00.000Z"));

    await recordStudySessionAnswer(id, true);

    const second = await endStudySession(id, new Date("2026-01-01T11:00:00.000Z"));

    expect(first?.status).toBe("abandoned");
    expect(second?.status).toBe("abandoned");
    expect(second?.completedAt).toBe(first?.completedAt);
  });

  it("should return null when ending an unknown session", async () => {
    expect(await endStudySession("missing", new Date())).toBeNull();
  });

  it("should list at most 200 sessions, newest first", async () => {
    await client.query(
      `INSERT INTO study_sessions (id, planned_duration_minutes, status, created_at)
       SELECT 'bulk_' || g, 10, 'planned', now() + (g || ' seconds')::interval FROM generate_series(1, 230) g`,
    );

    const list = await listStudySessions();

    expect(list).toHaveLength(200);
    expect(list[0]?.id).toBe("bulk_230");
  });
});
