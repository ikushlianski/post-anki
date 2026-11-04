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

const dbName = `owner_stats_learning_${randomUUID().replace(/-/g, "_")}`;
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

const { readLearningRows } = await import("./learning.repo.js");

let client: pg.Client;
let seq = 0;

async function insertReview(o: {
  grade: string;
  at: string;
  wasNew?: boolean;
  durationMs?: number | null;
  undone?: boolean;
}): Promise<void> {
  seq += 1;
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, duration_ms, reviewed_at, undone_at)
     VALUES ($1, 'kb_1', 'qv_1', $2, $3, $4, $5, $6)`,
    [`rev_${seq}`, o.grade, o.wasNew ?? false, o.durationMs ?? null, o.at, o.undone ? o.at : null],
  );
}

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

describe("readLearningRows", () => {
  it("should bucket live reviews by the owner's local day and hour and ignore undone ones", async () => {
    await insertReview({ grade: "good", at: "2026-03-10T02:30:00Z", wasNew: true, durationMs: 1500 });
    await insertReview({ grade: "again", at: "2026-03-10T15:00:00Z", durationMs: null });
    await insertReview({ grade: "easy", at: "2026-03-10T15:10:00Z", durationMs: 500 });
    await insertReview({ grade: "good", at: "2026-03-10T15:20:00Z", undone: true });
    await insertReview({ grade: "again", at: "2026-02-01T12:00:00Z" });

    const rows = await readLearningRows({
      tz: "America/New_York",
      startDate: "2026-03-01",
      last7StartDate: "2026-03-04",
    });

    expect(rows.daily).toEqual([
      { date: "2026-03-09", reviews: 1, newCards: 1, passed: 1, studyMs: 1500 },
      { date: "2026-03-10", reviews: 2, newCards: 0, passed: 1, studyMs: 500 },
    ]);
    expect(rows.hourly).toEqual([
      { hour: 11, reviews: 2 },
      { hour: 22, reviews: 1 },
    ]);
    expect(rows.accuracy).toEqual({ overallTotal: 4, overallPassed: 2, last7Total: 3, last7Passed: 2 });
  });
});
