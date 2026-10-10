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

const dbName = `kb_review_orch_${randomUUID().replace(/-/g, "_")}`;
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
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");
const { reviewKnowledgeBitSchedule } = await import("./knowledge-bit-schedule.repo.js");

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

async function seedBit(approvalState: "approved" | "pending" = "approved"): Promise<string> {
  const knowledgeBitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'TCP uses a three-way handshake.', $3)`,
    [knowledgeBitId, `ks_${randomUUID()}`, approvalState],
  );

  return knowledgeBitId;
}

async function seedVariant(knowledgeBitId: string, kind = "wh_question"): Promise<string> {
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, $3, 0, 'Why a handshake?', 'To agree on sequence numbers.')`,
    [variantId, knowledgeBitId, kind],
  );

  return variantId;
}

async function readSchedule(knowledgeBitId: string) {
  const { rows } = await client.query(
    `SELECT ease_factor, interval_days, due_at, last_reviewed_at, review_count FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
    [knowledgeBitId],
  );

  return rows[0] as
    | { ease_factor: number; interval_days: number; due_at: Date; last_reviewed_at: Date | null; review_count: number }
    | undefined;
}

async function readReviews(knowledgeBitId: string) {
  const { rows } = await client.query(
    `SELECT grade, was_new, duration_ms, prev_schedule, variant_id FROM knowledge_bit_reviews WHERE knowledge_bit_id = $1 ORDER BY reviewed_at`,
    [knowledgeBitId],
  );

  return rows as {
    grade: string;
    was_new: boolean;
    duration_ms: number | null;
    prev_schedule: Record<string, unknown> | null;
    variant_id: string;
  }[];
}

describe("recordKnowledgeBitReview (real Postgres)", () => {
  it("should hold a first-time card in learning for a minute and log it as new with no prior schedule", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);
    const now = new Date("2026-10-10T12:00:00.000Z");

    const outcome = await recordKnowledgeBitReview({ variantId, grade: "good", durationMs: 3200 }, now);

    expect(outcome).toMatchObject({ ok: true, knowledgeBitId, phase: "learning", intervalDays: 0, lapses: 0 });

    const schedule = await readSchedule(knowledgeBitId);

    expect(schedule?.review_count).toBe(1);
    expect(new Date(schedule!.due_at).toISOString()).toBe("2026-10-10T12:10:00.000Z");
    expect(await readReviews(knowledgeBitId)).toEqual([
      { grade: "good", was_new: true, duration_ms: 3200, prev_schedule: null, variant_id: variantId },
    ]);
  });

  it("should keep a full copy of the schedule as it was before the grade, so it can be restored later", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    await recordKnowledgeBitReview({ variantId, grade: "easy" }, new Date("2026-10-01T00:00:00.000Z"));
    const before = await readSchedule(knowledgeBitId);

    await recordKnowledgeBitReview({ variantId, grade: "again" }, new Date("2026-10-05T00:00:00.000Z"));

    const reviews = await readReviews(knowledgeBitId);

    expect(reviews).toHaveLength(2);
    expect(reviews[1]).toMatchObject({ grade: "again", was_new: false });
    expect(reviews[1]!.prev_schedule).toEqual({
      easeFactor: Number(before!.ease_factor),
      intervalDays: Number(before!.interval_days),
      dueAt: new Date(before!.due_at).toISOString(),
      lastReviewedAt: new Date(before!.last_reviewed_at!).toISOString(),
      reviewCount: 1,
      phase: "review",
      learningStep: 0,
      lapses: 0,
      suspendedAt: null,
      buriedUntil: null,
    });
    expect(reviews[0]).toMatchObject({ grade: "easy", was_new: true, prev_schedule: null });
  });

  it("should refuse to grade a card whose bit is still awaiting approval and leave no trace", async () => {
    const knowledgeBitId = await seedBit("pending");
    const variantId = await seedVariant(knowledgeBitId);

    const outcome = await recordKnowledgeBitReview({ variantId, grade: "good" });

    expect(outcome).toEqual({ ok: false, error: "not_approved" });
    expect(await readSchedule(knowledgeBitId)).toBeUndefined();
    expect(await readReviews(knowledgeBitId)).toEqual([]);
  });

  it("should refuse a card that does not exist", async () => {
    expect(await recordKnowledgeBitReview({ variantId: "kbqv_missing", grade: "good" })).toEqual({
      ok: false,
      error: "variant_not_found",
    });
  });

  it("should apply a typed answer and an Anki grade arriving together one after the other", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    await recordKnowledgeBitReview({ variantId, grade: "easy" });

    await Promise.all([
      reviewKnowledgeBitSchedule(knowledgeBitId, "Ok"),
      recordKnowledgeBitReview({ variantId, grade: "hard" }),
    ]);

    const schedule = await readSchedule(knowledgeBitId);
    const reviews = await readReviews(knowledgeBitId);

    expect(schedule?.review_count).toBe(3);
    expect(reviews).toHaveLength(2);
    // Ease 2.5, typed Ok +0.1 and Anki Hard -0.15 commute only when neither write is lost.
    expect(Number(schedule!.ease_factor)).toBeCloseTo(2.45, 5);
  });

  it("should never let two sibling variants graded at once overwrite each other", async () => {
    const knowledgeBitId = await seedBit();
    const whVariant = await seedVariant(knowledgeBitId, "wh_question");
    const blankVariant = await seedVariant(knowledgeBitId, "fill_in_the_blank");

    await Promise.all([
      recordKnowledgeBitReview({ variantId: whVariant, grade: "good" }),
      recordKnowledgeBitReview({ variantId: blankVariant, grade: "good" }),
    ]);

    const schedule = await readSchedule(knowledgeBitId);
    const reviews = await readReviews(knowledgeBitId);

    expect(schedule?.review_count).toBe(2);
    expect(reviews.map((review) => review.was_new).sort()).toEqual([false, true]);
    expect(reviews.find((review) => !review.was_new)?.prev_schedule).not.toBeNull();
  });

  it("should count a lapse and return a failed review card to review through the relearning step", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);
    const t0 = new Date("2026-10-01T00:00:00.000Z");

    await recordKnowledgeBitReview({ variantId, grade: "easy" }, t0);

    const failed = await recordKnowledgeBitReview({ variantId, grade: "again" }, new Date("2026-10-06T00:00:00.000Z"));

    expect(failed).toMatchObject({ ok: true, phase: "relearning", lapses: 1 });

    const passed = await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-06T00:10:00.000Z"));

    expect(passed).toMatchObject({ ok: true, phase: "review", intervalDays: 1, lapses: 1 });
  });

  it("should suspend a card automatically when this grade is its 8th forgetting", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);
    const now = new Date("2026-10-10T12:00:00.000Z");

    await recordKnowledgeBitReview({ variantId, grade: "easy" }, new Date("2026-10-01T00:00:00.000Z"));
    await client.query(`UPDATE knowledge_bit_schedules SET lapses = 7 WHERE knowledge_bit_id = $1`, [
      knowledgeBitId,
    ]);

    const outcome = await recordKnowledgeBitReview({ variantId, grade: "again" }, now);

    expect(outcome).toMatchObject({ ok: true, lapses: 8, leech: true, suspended: true });

    const { rows } = await client.query(
      `SELECT suspended_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
      [knowledgeBitId],
    );

    expect(new Date(rows[0]!.suspended_at).toISOString()).toBe(now.toISOString());
  });

  it("should treat an ungraded row left by a suspend as a new card when graded", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, review_count, phase) VALUES ($1, 0, 'new')`,
      [knowledgeBitId],
    );

    await recordKnowledgeBitReview({ variantId, grade: "good" });

    const reviews = await readReviews(knowledgeBitId);

    expect(reviews).toMatchObject([{ was_new: true, prev_schedule: null }]);
  });

  it("should return the stored result and make no second schedule change when the same requestId arrives twice", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);
    const requestId = randomUUID();

    const first = await recordKnowledgeBitReview(
      { variantId, grade: "easy", requestId },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    const scheduleAfterFirst = await readSchedule(knowledgeBitId);

    const retried = await recordKnowledgeBitReview(
      { variantId, grade: "easy", requestId },
      new Date("2026-10-05T00:00:00.000Z"),
    );

    expect(retried).toEqual(first);
    expect(await readSchedule(knowledgeBitId)).toEqual(scheduleAfterFirst);
    expect(await readReviews(knowledgeBitId)).toHaveLength(1);
  });
});
