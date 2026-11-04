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

const dbName = `probe_session_create_${randomUUID().replace(/-/g, "_")}`;
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

const { createSessionWithQuestions } = await import("./probe-session.repo.js");

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

describe("createSessionWithQuestions", () => {
  it("should not leave an empty session behind when saving its questions fails", async () => {
    const sessionId = `ps_${randomUUID()}`;

    await expect(
      createSessionWithQuestions({ id: sessionId, scope: "topic", scopeId: "top_x" }, [
        {
          id: `psq_${randomUUID()}`,
          sessionId,
          order: 1,
          prompt: null as unknown as string,
          options: ["a", "b"],
          correctAnswerIndex: 0,
        },
      ]),
    ).rejects.toThrow();

    const rows = await client.query(`SELECT id FROM probe_sessions WHERE id = $1`, [sessionId]);

    expect(rows.rows).toEqual([]);
  });

  it("should save the session together with its questions", async () => {
    const sessionId = `ps_${randomUUID()}`;

    const created = await createSessionWithQuestions(
      { id: sessionId, scope: "topic", scopeId: "top_x", total: 1 },
      [
        {
          id: `psq_${randomUUID()}`,
          sessionId,
          order: 1,
          prompt: "Q?",
          options: ["a", "b"],
          correctAnswerIndex: 0,
        },
      ],
    );

    expect(created?.questions).toHaveLength(1);
  });
});
