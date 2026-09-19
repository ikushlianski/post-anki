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

const dbName = `streak_repo_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { readOrCreateStreak, writeStreak } = await import("./streak.repo.js");

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

describe("readOrCreateStreak", () => {
  it("lets many first-ever concurrent callers all succeed with exactly one streak row", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => readOrCreateStreak()));

    for (const streak of results) {
      expect(streak).toEqual({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });
    }

    const { rows } = await client.query(`SELECT count(*)::int AS n FROM user_streaks`);

    expect(rows[0]!.n).toBe(1);
  });

  it("returns the stored streak once one exists", async () => {
    await writeStreak({ currentStreak: 3, longestStreak: 7, lastActiveDate: "2026-09-19" });

    const streak = await readOrCreateStreak();

    expect(streak).toEqual({ currentStreak: 3, longestStreak: 7, lastActiveDate: "2026-09-19" });
  });
});
