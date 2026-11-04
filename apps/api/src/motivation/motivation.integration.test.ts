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

const dbName = `motivation_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: databaseUrl.toString() });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = databaseUrl.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const streak = await import("../streak/streak.service.js");
const settings = await import("./motivation-settings.repo.js");
const { readTodayView } = await import("./motivation-today.orchestrator.js");
const { readSessionSummary } = await import("./motivation-session-summary.orchestrator.js");
const { readProgressView } = await import("./motivation-progress.orchestrator.js");
const { readWeeklySummary } = await import("./motivation-weekly-summary.orchestrator.js");
const { readOutcomeBadgeInputs } = await import("./motivation-badge-inputs.js");
const { readDailyReviewTarget, writeDailyReviewTarget } = await import("../study-goal/study-goal-daily.repo.js");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const DAY_MS = 86_400_000;
const daysAgo = (days: number, at: Date = NOW) => new Date(at.getTime() - days * DAY_MS);

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: databaseUrl.toString() });
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
  for (const table of [
    "review_point_events",
    "knowledge_bit_reviews",
    "knowledge_bit_schedules",
    "knowledge_bits",
    "knowledge_sources",
    "subject_priorities",
    "study_goals",
    "motivation_settings",
    "motivation_goal_days",
    "user_streaks",
    "subjects",
  ]) {
    await client.query(`DELETE FROM ${table}`);
  }
});

async function seedSubject(name: string): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [id, name]);

  return id;
}

async function seedCard(subjectId: string, schedule: { intervalDays: number; dueAt: Date } | null = null): Promise<string> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`, [
    sourceId,
    subjectId,
  ]);
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );

  if (schedule) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, interval_days, due_at) VALUES ($1, $2, $3)`,
      [bitId, schedule.intervalDays, schedule.dueAt],
    );
  }

  return bitId;
}

interface ReviewSeed {
  at: Date;
  grade?: string;
  prevIntervalDays?: number;
  prevLastReviewedAt?: Date;
  intervalAfter?: number;
  subjectId?: string;
  durationMs?: number;
}

async function seedReview(bitId: string, seed: ReviewSeed): Promise<void> {
  const reviewId = `kbreview_${randomUUID()}`;
  const prev =
    seed.prevIntervalDays === undefined
      ? null
      : JSON.stringify({
          intervalDays: seed.prevIntervalDays,
          lastReviewedAt: seed.prevLastReviewedAt?.toISOString() ?? null,
        });

  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, prev_schedule, duration_ms) VALUES ($1, $2, $3, $4, false, $5, $6, $7)`,
    [reviewId, bitId, `kbqv_${randomUUID()}`, seed.grade ?? "good", seed.at, prev, seed.durationMs ?? null],
  );

  if (seed.intervalAfter !== undefined) {
    await client.query(
      `INSERT INTO review_point_events (id, review_id, knowledge_bit_id, subject_id, awarded_day, points, reason, interval_days_after) VALUES ($1, $2, $3, $4, $5, 1, 'awarded', $6)`,
      [`rpe_${randomUUID()}`, reviewId, bitId, seed.subjectId ?? null, seed.at.toISOString().slice(0, 10), seed.intervalAfter],
    );
  }
}

async function seedReviews(bitId: string, count: number, at: Date): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await seedReview(bitId, { at: new Date(at.getTime() + index * 1000) });
  }
}

describe("goal-based streak", () => {
  it("should not count a day with fewer reviews than the minimum when no goal is set", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await seedReviews(card, 3, NOW);
    await streak.recordActivityToday(NOW.toISOString(), "review");

    expect((await streak.getStreak(NOW)).currentStreak).toBe(0);
  });

  it("should count a day once the minimum number of reviews is reached", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await seedReviews(card, 5, NOW);
    await streak.recordActivityToday(NOW.toISOString(), "review");

    expect((await streak.getStreak(NOW)).currentStreak).toBe(1);
  });

  it("should judge the day against the daily goal when one is set", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await writeDailyReviewTarget(8);
    await seedReviews(card, 6, NOW);
    await streak.recordActivityToday(NOW.toISOString(), "review");

    expect((await streak.getStreak(NOW)).currentStreak).toBe(0);

    await seedReviews(card, 2, new Date(NOW.getTime() + 60_000));
    await streak.recordActivityToday(NOW.toISOString(), "review");

    expect((await streak.getStreak(NOW)).currentStreak).toBe(1);
  });

  it("should count any non-review study session as activity for the day", async () => {
    await streak.recordActivityToday(NOW.toISOString());

    expect((await streak.getStreak(NOW)).currentStreak).toBe(1);
  });

  it("should put a late-evening review on the learner's own calendar day", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);
    const lateEvening = new Date("2090-03-11T03:30:00.000Z");

    await settings.writeMotivationSettings({ timeZone: "America/Los_Angeles", streakMinReviews: 1 });
    await seedReviews(card, 1, lateEvening);
    await streak.recordActivityToday(lateEvening.toISOString(), "review");

    expect((await streak.getStreak(lateEvening)).lastActiveDate).toBe("2090-03-10");
  });

  it("should keep the streak across one missed day by spending a rest day", async () => {
    await streak.recordActivityToday(daysAgo(2).toISOString());
    await streak.recordActivityToday(NOW.toISOString());

    const view = await streak.getGoalStreak(NOW);

    expect(view.current).toBe(2);
    expect(view.restDaysLeft).toBe(1);
  });

  it("should show the best streak and a comeback after a long break", async () => {
    await streak.recordActivityToday(daysAgo(12).toISOString());
    await streak.recordActivityToday(daysAgo(11).toISOString());

    const view = await streak.getGoalStreak(NOW);

    expect(view).toMatchObject({ status: "broken", current: 0, longest: 2, comeback: true, previousStreak: 2 });
  });

  it("should forgive a pause without spending rest days", async () => {
    await streak.recordActivityToday(daysAgo(6).toISOString());
    await streak.pauseStreak(5, daysAgo(5));

    const view = await streak.getGoalStreak(NOW);

    expect(view.status).not.toBe("broken");

    await streak.recordActivityToday(NOW.toISOString());

    expect((await streak.getGoalStreak(NOW)).restDaysLeft).toBe(2);
  });

  it("should lift a pause when asked to pause zero days", async () => {
    await streak.recordActivityToday(daysAgo(6).toISOString());
    await streak.pauseStreak(5, daysAgo(5));
    await streak.pauseStreak(0, daysAgo(4));

    expect((await streak.getGoalStreak(NOW)).pausedUntil).toBeNull();
  });
});

describe("today view", () => {
  it("should report reviews done against the daily goal or the streak minimum", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await seedReviews(card, 2, NOW);

    expect(await readTodayView(NOW)).toMatchObject({ reviewsDone: 2, threshold: 5, thresholdIsGoal: false, dayQualified: false });

    await writeDailyReviewTarget(2);

    expect(await readTodayView(NOW)).toMatchObject({ threshold: 2, thresholdIsGoal: true, dayQualified: true });
    expect(await readDailyReviewTarget()).toBe(2);
  });

  it("should flag a time zone that was never chosen", async () => {
    expect((await settings.readMotivationSettings()).timeZoneConfigured).toBe(false);

    await settings.writeMotivationSettings({ timeZone: "Europe/Berlin" });

    expect(await settings.readMotivationSettings()).toMatchObject({ timeZone: "Europe/Berlin", timeZoneConfigured: true });
  });
});

describe("session summary", () => {
  it("should show done versus goal, extra reviews as bonus and newly solid cards", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);
    const other = await seedCard(subject);

    await writeDailyReviewTarget(3);
    await seedReviews(card, 3, NOW);
    await seedReview(other, { at: NOW, prevIntervalDays: 10, intervalAfter: 25, subjectId: subject });
    await seedReview(card, { at: NOW, prevIntervalDays: 30, intervalAfter: 60, subjectId: subject });

    const summary = await readSessionSummary(NOW);

    expect(summary).toMatchObject({ doneToday: 5, goalTarget: 3, goalMet: true, bonus: 2, newlySolid: 1 });
  });

  it("should preview tomorrow's due cards with a time estimate from the learner's own pace", async () => {
    const subject = await seedSubject("Math");

    for (let index = 0; index < 6; index += 1) {
      await seedCard(subject, { intervalDays: 3, dueAt: new Date(NOW.getTime() + 20 * 3_600_000) });
    }

    await seedCard(subject, { intervalDays: 3, dueAt: new Date(NOW.getTime() + 3 * DAY_MS) });

    const filler = await seedCard(subject);

    await seedReview(filler, { at: daysAgo(3), durationMs: 20_000 });

    const summary = await readSessionSummary(NOW);

    expect(summary.tomorrowDue).toBe(6);
    expect(summary.tomorrowMinutes).toBe(2);
  });

  it("should not claim a goal was met when no goal is set", async () => {
    expect(await readSessionSummary(NOW)).toMatchObject({ goalTarget: null, goalMet: false, bonus: 0 });
  });

  it("should surface at most one recall after a long gap, the longest one", async () => {
    const subject = await seedSubject("History");
    const first = await seedCard(subject);
    const second = await seedCard(subject);

    await seedReview(first, { at: NOW, prevIntervalDays: 90, prevLastReviewedAt: daysAgo(100) });
    await seedReview(second, { at: NOW, prevIntervalDays: 90, prevLastReviewedAt: daysAgo(200) });

    const summary = await readSessionSummary(NOW);

    expect(summary.surprise).toMatchObject({ knowledgeBitId: second, gapDays: 200, subjectName: "History" });
  });

  it("should not celebrate a short-gap or failed recall", async () => {
    const subject = await seedSubject("History");
    const card = await seedCard(subject);

    await seedReview(card, { at: NOW, prevIntervalDays: 5, prevLastReviewedAt: daysAgo(5) });
    await seedReview(card, { at: NOW, grade: "again", prevIntervalDays: 90, prevLastReviewedAt: daysAgo(200) });

    expect((await readSessionSummary(NOW)).surprise).toBeNull();
  });
});

describe("progress view", () => {
  it("should fill the heatmap with every day and average over studied days", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await seedReviews(card, 4, NOW);
    await seedReviews(card, 2, daysAgo(2));

    const progress = await readProgressView(NOW, 7);

    expect(progress.heatmap).toHaveLength(7);
    expect(progress.heatmap[6]).toEqual({ date: "2090-03-10", reviews: 4 });
    expect(progress.dailyAverage).toBe(3);
  });

  it("should show how much of each subject is solid", async () => {
    const math = await seedSubject("Math");

    await seedCard(math, { intervalDays: 30, dueAt: NOW });
    await seedCard(math, { intervalDays: 2, dueAt: NOW });
    await seedCard(math);
    await seedCard(math, { intervalDays: 40, dueAt: NOW });

    const [subject] = (await readProgressView(NOW, 7)).subjects;

    expect(subject).toMatchObject({ subjectName: "Math", totalCards: 4, masteredCards: 2, percent: 50 });
  });

  it("should count cards made solid this week per subject and overall", async () => {
    const math = await seedSubject("Math");
    const card = await seedCard(math);

    await seedReview(card, { at: NOW, prevIntervalDays: 10, intervalAfter: 25, subjectId: math });

    const progress = await readProgressView(NOW, 7);

    expect(progress.solidThisWeek).toBe(1);
    expect(progress.subjects[0]).toMatchObject({ solidThisWeek: 1, solidThisMonth: 1 });
  });

  it("should measure retention only on cards that had gone long between reviews", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await seedReview(card, { at: daysAgo(1), prevIntervalDays: 40 });
    await seedReview(card, { at: daysAgo(2), prevIntervalDays: 40 });
    await seedReview(card, { at: daysAgo(3), prevIntervalDays: 40 });
    await seedReview(card, { at: daysAgo(4), grade: "again", prevIntervalDays: 40 });
    await seedReview(card, { at: daysAgo(5), grade: "again", prevIntervalDays: 3 });

    const progress = await readProgressView(NOW, 7);

    expect(progress.retentionOlderCards).toBe(75);
    expect(progress.retentionSample).toBe(4);
  });

  it("should not invent retention when there are no older cards", async () => {
    expect((await readProgressView(NOW, 7)).retentionOlderCards).toBeNull();
  });
});

describe("weekly summary", () => {
  it("should count goal days, compare with last week and ask for next week's priorities", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await writeDailyReviewTarget(2);
    await seedReviews(card, 2, NOW);
    await seedReviews(card, 1, daysAgo(1));
    await seedReviews(card, 4, daysAgo(7));

    const weekly = await readWeeklySummary(NOW);

    expect(weekly).toMatchObject({
      weekStart: "2090-03-06",
      goalDays: 1,
      activeDays: 2,
      reviews: 3,
      reviewsLastWeek: 4,
      focusTotal: 0,
      needsNextWeekPriorities: true,
    });
  });
});

describe("outcome badge inputs", () => {
  it("should keep goal days earned even after the daily goal is raised", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject, { intervalDays: 30, dueAt: NOW });

    await seedCard(subject, { intervalDays: 1, dueAt: NOW });
    await writeDailyReviewTarget(2);
    await seedReviews(card, 2, NOW);
    await streak.recordActivityToday(NOW.toISOString(), "review");
    await writeDailyReviewTarget(500);

    const inputs = await readOutcomeBadgeInputs();

    expect(inputs.goalDays).toBe(1);
    expect(inputs.subjectSolid).toEqual([{ subjectId: subject, subjectName: "Math", totalCards: 2, percent: 50 }]);
  });

  it("should count each qualified day once however many reviews follow", async () => {
    const subject = await seedSubject("Math");
    const card = await seedCard(subject);

    await writeDailyReviewTarget(1);
    await seedReviews(card, 1, NOW);
    await streak.recordActivityToday(NOW.toISOString(), "review");
    await seedReviews(card, 3, new Date(NOW.getTime() + 60_000));
    await streak.recordActivityToday(NOW.toISOString(), "review");

    expect((await readOutcomeBadgeInputs()).goalDays).toBe(1);
  });
});
