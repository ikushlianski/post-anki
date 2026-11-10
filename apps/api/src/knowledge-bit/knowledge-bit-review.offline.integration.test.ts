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

const dbName = `kb_review_offline_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
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

async function seedCard(): Promise<{ bitId: string; variantId: string }> {
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, `ks_${randomUUID()}`],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'wh_question', 0, 'Q?', 'A.')`,
    [variantId, bitId],
  );

  return { bitId, variantId };
}

async function countReviews(bitId: string, liveOnly: boolean): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total FROM knowledge_bit_reviews WHERE knowledge_bit_id = $1 ${liveOnly ? "AND undone_at IS NULL" : ""}`,
    [bitId],
  );

  return rows[0].total as number;
}

async function readDueAt(bitId: string): Promise<string> {
  const { rows } = await client.query(`SELECT due_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`, [bitId]);

  return new Date(rows[0].due_at).toISOString();
}

const T1 = new Date("2026-11-09T08:00:00.000Z");
const T2 = new Date("2026-11-09T08:30:00.000Z");

describe("offline grades (real Postgres)", () => {
  it("should schedule a late-synced grade from the time the learner gave it, not from the sync time", async () => {
    const { bitId, variantId } = await seedCard();

    await recordKnowledgeBitReview({ variantId, grade: "good" }, T1);

    expect(await readDueAt(bitId)).toBe("2026-11-09T08:10:00.000Z");
  });

  it("should not create a second review when the phone retries the same request", async () => {
    const { bitId, variantId } = await seedCard();
    const requestId = randomUUID();
    const first = await recordKnowledgeBitReview({ variantId, grade: "good", requestId }, T1);
    const retry = await recordKnowledgeBitReview({ variantId, grade: "good", requestId }, T1);

    expect(retry).toMatchObject({ ok: true, reviewId: (first as { reviewId: string }).reviewId });
    expect(await countReviews(bitId, false)).toBe(1);
  });

  it("should apply offline grades of one card in the order they were given", async () => {
    const { bitId, variantId } = await seedCard();

    await recordKnowledgeBitReview({ variantId, grade: "good" }, T1);
    const second = await recordKnowledgeBitReview({ variantId, grade: "good" }, T2);

    expect(second).toMatchObject({ ok: true, phase: "review" });
    expect(await countReviews(bitId, true)).toBe(2);
  });

  it("should ignore a grade older than the card's current schedule and award nothing", async () => {
    const { bitId, variantId } = await seedCard();
    const requestId = randomUUID();

    await recordKnowledgeBitReview({ variantId, grade: "good" }, T2);
    const dueBefore = await readDueAt(bitId);
    const outcome = await recordKnowledgeBitReview({ variantId, grade: "again", requestId, reviewedAt: T1.toISOString() }, T1);

    expect(outcome).toMatchObject({ ok: true, superseded: true, points: { awarded: 0 } });
    expect(await readDueAt(bitId)).toBe(dueBefore);
    expect(await countReviews(bitId, true)).toBe(1);
    expect(await countReviews(bitId, false)).toBe(2);

    const retry = await recordKnowledgeBitReview({ variantId, grade: "again", requestId, reviewedAt: T1.toISOString() }, T1);

    expect(retry).toMatchObject({ ok: true, superseded: true });
    expect(await countReviews(bitId, false)).toBe(2);
  });

  it("should never treat a grade that carries no review time as superseded", async () => {
    const { bitId, variantId } = await seedCard();

    await recordKnowledgeBitReview({ variantId, grade: "good" }, T2);
    const outcome = await recordKnowledgeBitReview({ variantId, grade: "good" }, T1);

    expect(outcome).not.toHaveProperty("superseded");
    expect(await countReviews(bitId, true)).toBe(2);
  });

  it("should undo a backdated grade like any other", async () => {
    const { variantId } = await seedCard();
    const outcome = await recordKnowledgeBitReview({ variantId, grade: "good" }, T1);

    expect(await undoKnowledgeBitReview((outcome as { reviewId: string }).reviewId)).toMatchObject({ ok: true });
  });

  it("should refuse to undo a superseded grade because it changed nothing", async () => {
    const { variantId } = await seedCard();

    await recordKnowledgeBitReview({ variantId, grade: "good" }, T2);
    const outcome = await recordKnowledgeBitReview({ variantId, grade: "again", reviewedAt: T1.toISOString() }, T1);

    expect(await undoKnowledgeBitReview((outcome as { reviewId: string }).reviewId)).toEqual({
      ok: false,
      error: "not_latest",
    });
  });
});
