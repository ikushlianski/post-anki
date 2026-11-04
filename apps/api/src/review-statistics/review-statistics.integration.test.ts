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

const dbName = `review_statistics_${randomUUID().replace(/-/g, "_")}`;
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

const { getReviewStatistics } = await import("./review-statistics.service.js");

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


async function insertSubject(overrides: { id: string; parentId?: string }): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, parent_id) VALUES ($1, $1, false, $2)`,
    [overrides.id, overrides.parentId ?? null],
  );
}

async function insertCard(overrides: {
  id: string;
  subjectId: string;
  dueAt?: Date;
  suspended?: boolean;
  buriedUntil?: Date;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [`src_${overrides.id}`, overrides.subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, $2, 1, 'A body', 'approved')`,
    [overrides.id, `src_${overrides.id}`],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'A prompt?', 'An answer')`,
    [`qv_${overrides.id}`, overrides.id],
  );

  if (overrides.dueAt) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, review_count, suspended_at, buried_until)
       VALUES ($1, $2, 1, $3, $4)`,
      [
        overrides.id,
        overrides.dueAt.toISOString(),
        overrides.suspended ? new Date().toISOString() : null,
        overrides.buriedUntil?.toISOString() ?? null,
      ],
    );
  }
}

let reviewSeq = 0;

async function insertReview(overrides: {
  bitId: string;
  grade: "again" | "hard" | "good" | "easy";
  at: Date;
  phase?: "new" | "learning" | "review" | "relearning";
  undone?: boolean;
}): Promise<void> {
  reviewSeq += 1;
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, prev_schedule, reviewed_at, undone_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `rev_${reviewSeq}`,
      overrides.bitId,
      `qv_${overrides.bitId}`,
      overrides.grade,
      (overrides.phase ?? "review") === "new",
      JSON.stringify({ phase: overrides.phase ?? "review" }),
      overrides.at.toISOString(),
      overrides.undone ? overrides.at.toISOString() : null,
    ],
  );
}

const HOUR = 60 * 60 * 1000;
const NOON_UTC = new Date("2026-03-10T12:00:00Z");
const QUERY = { tz: "UTC", forecastDays: 14, historyDays: 90 } as const;

describe("getReviewStatistics forecast", () => {
  it("should count a card due at 23:30 New York time as due today even though it is already tomorrow in UTC", async () => {
    await insertSubject({ id: "rs_ny" });
    await insertCard({ id: "bit_ny", subjectId: "rs_ny", dueAt: new Date("2026-03-11T03:30:00Z") });

    const stats = await getReviewStatistics(
      { ...QUERY, tz: "America/New_York", subjectId: "rs_ny" },
      new Date("2026-03-10T20:00:00Z"),
    );

    expect(stats.forecast.days[0]).toEqual({ date: "2026-03-10", count: 1 });
    expect(stats.forecast.days[1]).toEqual({ date: "2026-03-11", count: 0 });
  });

  it("should put overdue cards in the overdue bucket and never in a future day", async () => {
    await insertSubject({ id: "rs_over" });
    await insertCard({ id: "bit_over", subjectId: "rs_over", dueAt: new Date(NOON_UTC.getTime() - 48 * HOUR) });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_over" }, NOON_UTC);

    expect(stats.forecast.overdue).toBe(1);
    expect(stats.forecast.days.every((day) => day.count === 0)).toBe(true);
  });

  it("should leave suspended cards out and list buried cards on the day their burial ends", async () => {
    await insertSubject({ id: "rs_ctl" });
    await insertCard({ id: "bit_susp", subjectId: "rs_ctl", dueAt: new Date(NOON_UTC.getTime() + 2 * HOUR), suspended: true });
    await insertCard({
      id: "bit_buried",
      subjectId: "rs_ctl",
      dueAt: new Date(NOON_UTC.getTime() - 2 * HOUR),
      buriedUntil: new Date(NOON_UTC.getTime() + 36 * HOUR),
    });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_ctl" }, NOON_UTC);

    expect(stats.forecast.overdue).toBe(0);
    expect(stats.forecast.days.map((day) => day.count)).toEqual([0, 0, 1, ...Array(11).fill(0)]);
  });

  it("should include sub-subjects when filtering by subject and exclude other subjects", async () => {
    await insertSubject({ id: "rs_parent" });
    await insertSubject({ id: "rs_child", parentId: "rs_parent" });
    await insertSubject({ id: "rs_other" });
    const due = new Date(NOON_UTC.getTime() + 25 * HOUR);

    await insertCard({ id: "bit_child", subjectId: "rs_child", dueAt: due });
    await insertCard({ id: "bit_other", subjectId: "rs_other", dueAt: due });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_parent" }, NOON_UTC);

    expect(stats.forecast.days[1]?.count).toBe(1);
  });

  it("should return empty statistics for an unknown subject", async () => {
    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_missing" }, NOON_UTC);

    expect(stats.forecast.days).toHaveLength(14);
    expect(stats.answerButtons.total).toBe(0);
  });
});

describe("getReviewStatistics history", () => {
  it("should not count undone reviews in retention or button counts", async () => {
    await insertSubject({ id: "rs_undo" });
    await insertCard({ id: "bit_undo", subjectId: "rs_undo" });
    await insertReview({ bitId: "bit_undo", grade: "good", at: new Date(NOON_UTC.getTime() - HOUR) });
    await insertReview({ bitId: "bit_undo", grade: "again", at: new Date(NOON_UTC.getTime() - HOUR), undone: true });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_undo" }, NOON_UTC);

    expect(stats.retention.overallRate).toBe(1);
    expect(stats.answerButtons.counts).toEqual({ again: 0, hard: 0, good: 1, easy: 0 });
  });

  it("should count Hard on a mature card as remembered and Again as forgotten", async () => {
    await insertSubject({ id: "rs_ret" });
    await insertCard({ id: "bit_ret", subjectId: "rs_ret" });
    await insertReview({ bitId: "bit_ret", grade: "hard", at: new Date(NOON_UTC.getTime() - HOUR) });
    await insertReview({ bitId: "bit_ret", grade: "again", at: new Date(NOON_UTC.getTime() - 2 * HOUR) });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_ret" }, NOON_UTC);

    expect(stats.retention.points).toEqual([{ date: "2026-03-10", total: 2, passed: 1, rate: 0.5 }]);
  });

  it("should exclude first-time learning steps from retention but keep them in button counts", async () => {
    await insertSubject({ id: "rs_learn" });
    await insertCard({ id: "bit_learn", subjectId: "rs_learn" });

    for (const phase of ["new", "learning", "learning"] as const) {
      await insertReview({ bitId: "bit_learn", grade: "again", at: new Date(NOON_UTC.getTime() - HOUR), phase });
    }

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_learn" }, NOON_UTC);

    expect(stats.retention.overallRate).toBeNull();
    expect(stats.answerButtons.counts.again).toBe(3);
  });

  it("should return all four grades with zero counts when the learner has not pressed one", async () => {
    await insertSubject({ id: "rs_zero" });

    const stats = await getReviewStatistics({ ...QUERY, subjectId: "rs_zero" }, NOON_UTC);

    expect(stats.answerButtons).toEqual({ total: 0, counts: { again: 0, hard: 0, good: 0, easy: 0 } });
  });

  it("should keep a review made at 00:30 local on the correct local day across a daylight-saving change", async () => {
    await insertSubject({ id: "rs_dst" });
    await insertCard({ id: "bit_dst", subjectId: "rs_dst" });
    await insertReview({ bitId: "bit_dst", grade: "good", at: new Date("2026-03-08T05:30:00Z") });
    await insertReview({ bitId: "bit_dst", grade: "good", at: new Date("2026-03-09T04:30:00Z") });

    const stats = await getReviewStatistics(
      { ...QUERY, tz: "America/New_York", subjectId: "rs_dst" },
      new Date("2026-03-10T16:00:00Z"),
    );

    expect(stats.retention.points.map((point) => point.date)).toEqual(["2026-03-08", "2026-03-09"]);
  });

  it("should use weekly buckets for long windows", async () => {
    await insertSubject({ id: "rs_week" });
    await insertCard({ id: "bit_week", subjectId: "rs_week" });
    await insertReview({ bitId: "bit_week", grade: "good", at: new Date("2026-03-10T10:00:00Z") });

    const stats = await getReviewStatistics({ ...QUERY, historyDays: 365, subjectId: "rs_week" }, NOON_UTC);

    expect(stats.retention.granularity).toBe("week");
    expect(stats.retention.points[0]?.date).toBe("2026-03-09");
  });
});
