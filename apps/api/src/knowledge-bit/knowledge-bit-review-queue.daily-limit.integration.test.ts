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

const dbName = `kb_review_daily_limit_${randomUUID().replace(/-/g, "_")}`;
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
const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");
const { updateAdminSettings } = await import("../admin-settings/admin-settings.repo.js");

let client: pg.Client;

const NOW = new Date("2090-03-10T12:00:00.000Z");
const DAY = 86_400_000;

async function seedCard(dueAt: Date): Promise<{ bitId: string; variantId: string }> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text) VALUES ($1, 'prose', 'source')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.')`,
    [variantId, bitId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count) VALUES ($1, 2.5, 10, $2, 1)`,
    [bitId, dueAt],
  );

  return { bitId, variantId };
}

async function seedReviews(total: number, undone = false): Promise<void> {
  for (let i = 0; i < total; i++) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at) VALUES ($1, $2, $3, 'good', false, $4, $5)`,
      [`kbreview_${randomUUID()}`, `kb_${randomUUID()}`, `kbqv_${randomUUID()}`, NOW, undone ? NOW : null],
    );
  }
}

function fetchQueue(aheadDays?: number) {
  return getKnowledgeBitReviewQueue(50, undefined, { tz: "UTC", now: NOW, aheadDays });
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

beforeEach(async () => {
  await client.query(`DELETE FROM knowledge_bit_reviews`);
  await client.query(`DELETE FROM knowledge_bit_schedules`);
  await client.query(`DELETE FROM knowledge_bit_question_variants`);
  await client.query(`DELETE FROM knowledge_bits`);
  await client.query(`DELETE FROM app_settings`);
});

describe("daily review limit on the review queue (real Postgres)", () => {
  it("should hand out due cards and report no limit hit while under the limit", async () => {
    await seedCard(new Date(NOW.getTime() - DAY));
    await updateAdminSettings({ maxReviewsPerDay: 5 });
    await seedReviews(4);

    const queue = await fetchQueue();

    expect(queue.cards).toHaveLength(1);
    expect(queue.limitReached).toBe(false);
    expect(queue.reviewedToday).toBe(4);
    expect(queue.limit).toBe(5);
  });

  it("should return no cards and say the limit is reached once today's reviews hit it", async () => {
    await seedCard(new Date(NOW.getTime() - DAY));
    await updateAdminSettings({ maxReviewsPerDay: 5 });
    await seedReviews(5);

    const queue = await fetchQueue();

    expect(queue.cards).toHaveLength(0);
    expect(queue.limitReached).toBe(true);
    expect(queue.reviewedToday).toBe(5);
    expect(queue.limit).toBe(5);
    expect(queue.nextDueAt).toBe("2090-03-11T00:00:00.000Z");
  });

  it("should still offer review-ahead cards after the limit is reached", async () => {
    const tomorrow = await seedCard(new Date("2090-03-11T10:00:00.000Z"));
    await updateAdminSettings({ maxReviewsPerDay: 2 });
    await seedReviews(2);

    const queue = await fetchQueue(1);

    expect(queue.limitReached).toBe(true);
    expect(queue.cards.map((card) => card.variantId)).toEqual([tomorrow.variantId]);
  });

  it("should not count undone reviews toward the limit", async () => {
    await seedCard(new Date(NOW.getTime() - DAY));
    await updateAdminSettings({ maxReviewsPerDay: 3 });
    await seedReviews(3, true);

    const queue = await fetchQueue();

    expect(queue.reviewedToday).toBe(0);
    expect(queue.limitReached).toBe(false);
    expect(queue.cards).toHaveLength(1);
  });

  it("should never stop the learner when the limit is 0 (unlimited)", async () => {
    await seedCard(new Date(NOW.getTime() - DAY));
    await updateAdminSettings({ maxReviewsPerDay: 0 });
    await seedReviews(300);

    const queue = await fetchQueue();

    expect(queue.limitReached).toBe(false);
    expect(queue.cards).toHaveLength(1);
  });
});
