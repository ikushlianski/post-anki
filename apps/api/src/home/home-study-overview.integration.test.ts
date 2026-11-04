import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const dbName = `home_study_overview_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getStudyOverview } = await import("./home-study-overview.service.js");
const { getKnowledgeBitReviewQueue } =
  await import("../knowledge-bit/knowledge-bit-review-queue.repo.js");
const { studyOverviewQuerySchema } = await import("@post-anki/shared");

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

beforeEach(async () => {
  await client.query(`DELETE FROM knowledge_bit_reviews`);
});

const NOW = new Date("2026-03-10T03:45:00Z");
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

async function insertBit(id: string, ordinal: number): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'text', 'pending') ON CONFLICT DO NOTHING`,
    ["hso_src"],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, 'hso_src', $2, 'A body', 'approved')`,
    [id, ordinal],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'A prompt?', 'An answer')`,
    [`qv_${id}`, id],
  );
}

async function insertSchedule(knowledgeBitId: string, dueAt: Date): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, review_count) VALUES ($1, $2, 1)`,
    [knowledgeBitId, dueAt.toISOString()],
  );
}

async function insertReview(id: string, reviewedAt: Date, undoneAt?: Date): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at)
     VALUES ($1, 'hso_any_bit', 'hso_any_variant', 'good', false, $2, $3)`,
    [id, reviewedAt.toISOString(), undoneAt?.toISOString() ?? null],
  );
}

describe("getStudyOverview", () => {
  it("should show the same new, learning and due numbers on home as the review session reports", async () => {
    await insertBit("hso_due_1", 1);
    await insertSchedule("hso_due_1", YESTERDAY);
    await insertBit("hso_due_2", 2);
    await insertSchedule("hso_due_2", YESTERDAY);
    await insertBit("hso_new_1", 3);
    await insertBit("hso_new_2", 4);

    const overview = await getStudyOverview({ tz: "UTC", days: 28 }, NOW);
    const queue = await getKnowledgeBitReviewQueue(10, undefined, {
      tz: "UTC",
      now: NOW,
    });

    expect(overview.counts).toEqual(queue.counts);
    expect(overview.counts.review).toBe(2);
    expect(overview.hasCards).toBe(true);
  });

  it("should count a review done at 23:30 New York time as today for a New York learner even though it is already tomorrow in UTC", async () => {
    await insertReview("hso_ny", new Date("2026-03-10T03:30:00Z"));

    const newYork = await getStudyOverview({ tz: "America/New_York", days: 7 }, NOW);
    const utc = await getStudyOverview({ tz: "UTC", days: 7 }, NOW);

    expect(newYork.activity.at(-1)).toEqual({ date: "2026-03-09", count: 1 });
    expect(newYork.reviewedToday).toBe(1);
    expect(utc.activity.at(-1)).toEqual({ date: "2026-03-10", count: 1 });
  });

  it("should not count undone reviews in reviewed-today or the calendar", async () => {
    await insertReview("hso_kept", new Date("2026-03-10T01:00:00Z"));
    await insertReview(
      "hso_undone",
      new Date("2026-03-10T02:00:00Z"),
      new Date("2026-03-10T02:01:00Z"),
    );

    const overview = await getStudyOverview({ tz: "UTC", days: 3 }, NOW);

    expect(overview.reviewedToday).toBe(1);
    expect(overview.activity.reduce((sum, day) => sum + day.count, 0)).toBe(1);
  });

  it("should fill days with no reviews as zero and return exactly the requested number of days", async () => {
    await insertReview("hso_old", new Date("2026-03-05T10:00:00Z"));

    const overview = await getStudyOverview({ tz: "UTC", days: 10 }, NOW);

    expect(overview.activity).toHaveLength(10);
    expect(overview.activity[0]).toEqual({ date: "2026-03-01", count: 0 });
    expect(overview.activity.find((day) => day.date === "2026-03-05")?.count).toBe(1);
    expect(overview.activity.at(-1)?.date).toBe("2026-03-10");
  });

  it("should exclude reviews older than the requested window", async () => {
    await insertReview("hso_outside", new Date("2026-02-01T10:00:00Z"));

    const overview = await getStudyOverview({ tz: "UTC", days: 5 }, NOW);

    expect(overview.activity.every((day) => day.count === 0)).toBe(true);
  });
});

describe("studyOverviewQuerySchema", () => {
  it("should reject an invalid timezone and cap the days range", () => {
    expect(studyOverviewQuerySchema.safeParse({ tz: "Mars/Base" }).success).toBe(false);
    expect(studyOverviewQuerySchema.safeParse({ days: "500" }).success).toBe(false);
    expect(studyOverviewQuerySchema.safeParse({ days: "0" }).success).toBe(false);
    expect(studyOverviewQuerySchema.parse({})).toEqual({ tz: "UTC", days: 28 });
  });
});
