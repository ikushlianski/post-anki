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

const dbName = `kb_new_limit_${randomUUID().replace(/-/g, "_")}`;
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

const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");
const { getSubjectReviewDueCounts } = await import("./subject-review-due-counts.repo.js");
const { updateAdminSettings } = await import("../admin-settings/admin-settings.repo.js");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const CLOCK = { tz: "UTC", now: NOW };

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
  await client.query(`DELETE FROM knowledge_bit_reviews`);
  await client.query(`DELETE FROM knowledge_bit_question_variants`);
  await client.query(`DELETE FROM knowledge_bits`);
  await client.query(`DELETE FROM app_settings`);
});

async function seedFreshCards(total: number): Promise<void> {
  for (let i = 0; i < total; i++) {
    const bitId = `kb_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
      [bitId, `ks_${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'wh_question', 0, 'Q?', 'A.')`,
      [`kbqv_${randomUUID()}`, bitId],
    );
  }
}

async function seedNewCardReviews(total: number): Promise<void> {
  for (let i = 0; i < total; i++) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $2, $3, 'good', true, $4)`,
      [`kbreview_${randomUUID()}`, `kb_${randomUUID()}`, `kbqv_${randomUUID()}`, NOW],
    );
  }
}

describe("learner-set daily new-card limit (real Postgres)", () => {
  it("should serve 20 new cards a day when the learner never changed the setting", async () => {
    await seedFreshCards(25);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(20);
    expect(queue.counts.new).toBe(20);
    expect(queue.newRemainingToday).toBe(20);
  });

  it("should serve and count as many new cards as the stored limit allows", async () => {
    await seedFreshCards(25);
    await updateAdminSettings({ newCardsPerDay: 5 });

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(5);
    expect(queue.counts.new).toBe(5);
    expect(queue.newRemainingToday).toBe(5);
  });

  it("should give the review queue and the subject counts the same remaining number", async () => {
    await seedFreshCards(10);
    await updateAdminSettings({ newCardsPerDay: 7 });
    await seedNewCardReviews(2);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);
    const counts = await getSubjectReviewDueCounts(CLOCK);

    expect(queue.newRemainingToday).toBe(5);
    expect(counts.newRemainingToday).toBe(5);
    expect(counts.unsorted.newCount).toBe(5);
  });

  it("should flag the queue as limit-reached when today's cap hides waiting new cards", async () => {
    await seedFreshCards(3);
    await updateAdminSettings({ newCardsPerDay: 2 });
    await seedNewCardReviews(2);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(0);
    expect(queue.newLimitReached).toBe(true);
  });

  it("should not flag limit-reached when no new cards are waiting behind the cap", async () => {
    await updateAdminSettings({ newCardsPerDay: 2 });
    await seedNewCardReviews(2);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.newLimitReached).toBe(false);
  });

  it("should clamp an out-of-range stored limit to 200", async () => {
    await client.query(`INSERT INTO app_settings (id, new_cards_per_day) VALUES ('app', 5000)`);
    await seedNewCardReviews(150);
    await seedFreshCards(1);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.newRemainingToday).toBe(50);
  });
});
