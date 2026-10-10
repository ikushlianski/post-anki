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

const dbName = `kb_review_undo_${randomUUID().replace(/-/g, "_")}`;
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
const { undoKnowledgeBitReview } = await import("./knowledge-bit-review-undo.orchestrator.js");
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
    `SELECT ease_factor, interval_days, due_at, last_reviewed_at, review_count, phase, lapses, suspended_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
    [knowledgeBitId],
  );

  return rows[0] as
    | {
        ease_factor: number;
        interval_days: number;
        due_at: Date;
        last_reviewed_at: Date | null;
        review_count: number;
        phase: string;
        lapses: number;
        suspended_at: Date | null;
      }
    | undefined;
}

async function countNewToday(knowledgeBitId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total FROM knowledge_bit_reviews WHERE knowledge_bit_id = $1 AND was_new AND undone_at IS NULL`,
    [knowledgeBitId],
  );

  return rows[0].total;
}

async function grade(variantId: string, g: "again" | "hard" | "good" | "easy", at: string) {
  const outcome = await recordKnowledgeBitReview({ variantId, grade: g }, new Date(at));

  if (!outcome.ok) {
    throw new Error("grade failed");
  }

  return outcome.reviewId;
}

describe("undoKnowledgeBitReview (real Postgres)", () => {
  it("should give the card back the exact schedule it had before the grade", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);

    await grade(variantId, "easy", "2026-10-01T00:00:00.000Z");
    const before = await readSchedule(bitId);
    const reviewId = await grade(variantId, "again", "2026-10-05T00:00:00.000Z");

    expect(await undoKnowledgeBitReview(reviewId)).toEqual({ ok: true, knowledgeBitId: bitId });
    expect(await readSchedule(bitId)).toEqual(before);
  });

  it("should make an undone first grade a new card again that no longer counts toward today's new cards", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const reviewId = await grade(variantId, "good", "2026-10-10T00:00:00.000Z");

    await undoKnowledgeBitReview(reviewId);

    const schedule = await readSchedule(bitId);

    expect(schedule).toMatchObject({ review_count: 0, phase: "new", last_reviewed_at: null });
    expect(await countNewToday(bitId)).toBe(0);
  });

  it("should refuse to undo a grade after the card was answered in typed mode", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const reviewId = await grade(variantId, "good", "2026-10-01T00:00:00.000Z");

    await reviewKnowledgeBitSchedule(bitId, "Ok");

    const typed = await readSchedule(bitId);

    expect(await undoKnowledgeBitReview(reviewId)).toEqual({ ok: false, error: "not_latest" });
    expect(await readSchedule(bitId)).toEqual(typed);
  });

  it("should refuse a second undo of the same grade and never restore twice", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const reviewId = await grade(variantId, "good", "2026-10-01T00:00:00.000Z");

    await undoKnowledgeBitReview(reviewId);

    expect(await undoKnowledgeBitReview(reviewId)).toEqual({ ok: false, error: "not_latest" });
  });

  it("should walk back two grades of one card newest first and refuse the older one first", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const first = await grade(variantId, "good", "2026-10-01T00:00:00.000Z");
    const second = await grade(variantId, "good", "2026-10-01T00:01:00.000Z");

    expect(await undoKnowledgeBitReview(first)).toEqual({ ok: false, error: "not_latest" });
    expect((await undoKnowledgeBitReview(second)).ok).toBe(true);
    expect((await undoKnowledgeBitReview(first)).ok).toBe(true);
    expect((await readSchedule(bitId))?.review_count).toBe(0);
  });

  it("should lift the suspension a leech grade caused when that grade is undone", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);

    await grade(variantId, "easy", "2026-10-01T00:00:00.000Z");
    await client.query(`UPDATE knowledge_bit_schedules SET lapses = 7 WHERE knowledge_bit_id = $1`, [bitId]);

    const reviewId = await grade(variantId, "again", "2026-10-10T00:00:00.000Z");

    expect((await readSchedule(bitId))?.suspended_at).not.toBeNull();

    await undoKnowledgeBitReview(reviewId);

    expect(await readSchedule(bitId)).toMatchObject({ suspended_at: null, lapses: 7 });
  });

  it("should report an unknown review as not found", async () => {
    expect(await undoKnowledgeBitReview("kbreview_missing")).toEqual({
      ok: false,
      error: "review_not_found",
    });
  });

  it("should let only one of two simultaneous undos of the same grade win", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const reviewId = await grade(variantId, "good", "2026-10-01T00:00:00.000Z");

    const results = await Promise.all([undoKnowledgeBitReview(reviewId), undoKnowledgeBitReview(reviewId)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("should never restore a stale schedule over a grade that lands at the same time", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);
    const reviewId = await grade(variantId, "good", "2026-10-01T00:00:00.000Z");

    const [, undone] = await Promise.all([
      recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-02T00:00:00.000Z")),
      undoKnowledgeBitReview(reviewId),
    ]);
    const schedule = await readSchedule(bitId);

    if (undone.ok) {
      expect(schedule?.review_count).toBe(1);
    } else {
      expect(schedule?.review_count).toBe(2);
    }
  });
});
