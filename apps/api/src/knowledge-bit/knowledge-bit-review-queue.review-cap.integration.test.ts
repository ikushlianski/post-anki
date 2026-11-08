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

const dbName = `kb_review_cap_${randomUUID().replace(/-/g, "_")}`;
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
const { countKnowledgeBitBrowserSubjects } = await import("./knowledge-bit-browser.repo.js");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const CLOCK = { tz: "UTC", now: NOW };
const OVERDUE = new Date("2090-03-09T12:00:00.000Z");
const FAR_FUTURE = new Date("2091-01-01T00:00:00.000Z");

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
    "knowledge_bit_reviews",
    "knowledge_bit_schedules",
    "knowledge_bit_question_variants",
    "knowledge_bits",
    "knowledge_sources",
    "topics",
    "modules",
    "curricula",
    "subjects",
    "app_settings",
  ]) {
    await client.query(`TRUNCATE ${table} CASCADE`);
  }
});

async function insertSubject(id: string, options: { parentId?: string; cap?: number | null } = {}) {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, parent_id, max_reviews_per_day) VALUES ($1, $1, false, $2, $3)`,
    [id, options.parentId ?? null, options.cap ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [`src_${id}`, id],
  );
}

async function insertCard(
  subjectId: string,
  phase: "review" | "learning" | "new",
  options: { topicId?: string } = {},
): Promise<string> {
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state) VALUES ($1, $2, 0, 'body', $3, 'approved')`,
    [bitId, `src_${subjectId}`, options.topicId ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'wh_question', 0, 'Q?', 'A.')`,
    [`kbqv_${randomUUID()}`, bitId],
  );

  if (phase !== "new") {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, review_count, phase) VALUES ($1, $2, 1, $3)`,
      [bitId, OVERDUE.toISOString(), phase],
    );
  }

  return bitId;
}

async function insertPlacedTopic(subjectId: string): Promise<string> {
  const id = `top_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'C', 'confirmed')`, [
    `cur_${id}`,
    subjectId,
  ]);
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'M', 1)`, [
    `mod_${id}`,
    `cur_${id}`,
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, learning_status) VALUES ($1, $2, $3, 'T', 1, true, 'not_started')`,
    [id, `mod_${id}`, `cur_${id}`],
  );

  return id;
}

async function answerReview(subjectId: string, prevPhase: "review" | "learning"): Promise<void> {
  const bitId = await insertCard(subjectId, "review");

  await client.query(`UPDATE knowledge_bit_schedules SET due_at = $2 WHERE knowledge_bit_id = $1`, [
    bitId,
    FAR_FUTURE.toISOString(),
  ]);
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, prev_schedule, reviewed_at) VALUES ($1, $2, $3, 'good', false, $4::jsonb, $5)`,
    [
      `kbreview_${randomUUID()}`,
      bitId,
      `kbqv_${randomUUID()}`,
      JSON.stringify({
        easeFactor: 2.5,
        intervalDays: 3,
        dueAt: OVERDUE.toISOString(),
        lastReviewedAt: null,
        reviewCount: 1,
        phase: prevPhase,
      }),
      NOW,
    ],
  );
}

async function setGlobalReviewLimit(limit: number): Promise<void> {
  await client.query(`INSERT INTO app_settings (id, max_reviews_per_day) VALUES ('app', $1)`, [limit]);
}

describe("per-subject daily review cap (real Postgres)", () => {
  it("should serve only the subject's review cap of due review cards and keep learning cards uncapped", async () => {
    await insertSubject("cap_a", { cap: 2 });

    for (let i = 0; i < 4; i++) {
      await insertCard("cap_a", "review");
    }

    await insertCard("cap_a", "learning");

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards.filter((card) => card.phase === "review")).toHaveLength(2);
    expect(queue.cards.filter((card) => card.phase === "learning")).toHaveLength(1);
    expect(queue.counts.review).toBe(2);
    expect(queue.counts.learning).toBe(1);
  });

  it("should serve every due review when the subject cap is 0", async () => {
    await insertSubject("cap_zero", { cap: 0 });

    for (let i = 0; i < 4; i++) {
      await insertCard("cap_zero", "review");
    }

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(4);
    expect(queue.counts.review).toBe(4);
  });

  it("should stop serving reviews after the cap is used and point the next due time at day end", async () => {
    await insertSubject("cap_used", { cap: 2 });
    await insertCard("cap_used", "review");
    await insertCard("cap_used", "review");
    await answerReview("cap_used", "review");
    await answerReview("cap_used", "review");

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(0);
    expect(queue.counts.review).toBe(0);
    expect(queue.nextDueAt).toBe("2090-03-11T00:00:00.000Z");
  });

  it("should not spend the review cap on answers that were learning steps", async () => {
    await insertSubject("cap_steps", { cap: 1 });
    await insertCard("cap_steps", "review");
    await answerReview("cap_steps", "learning");
    await answerReview("cap_steps", "learning");

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(1);
  });

  it("should give each child of a capped parent its own inherited allowance", async () => {
    await insertSubject("cap_parent", { cap: 2 });
    await insertSubject("cap_child_a", { parentId: "cap_parent" });
    await insertSubject("cap_child_b", { parentId: "cap_parent" });

    for (let i = 0; i < 3; i++) {
      await insertCard("cap_child_a", "review");
      await insertCard("cap_child_b", "review");
    }

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(4);
  });
});

describe("subject today counts (real Postgres)", () => {
  it("should report today per subject and sum capped children into the parent after reviews are answered", async () => {
    await insertSubject("today_parent", { cap: 2 });
    await insertSubject("today_a", { parentId: "today_parent" });
    await insertSubject("today_b", { parentId: "today_parent" });

    for (let i = 0; i < 3; i++) {
      await insertCard("today_a", "review");
      await insertCard("today_b", "review");
    }

    await insertCard("today_a", "learning");

    const before = await getSubjectReviewDueCounts(CLOCK);
    const rowsBefore = Object.fromEntries(before.subjects.map((row) => [row.subjectId, row]));

    expect(rowsBefore.today_a).toMatchObject({ reviewTodayCount: 2, learningDueCount: 1, todayCount: 3 });
    expect(rowsBefore.today_b).toMatchObject({ reviewTodayCount: 2, todayCount: 2 });
    expect(rowsBefore.today_parent).toMatchObject({
      reviewTodayCount: 4,
      learningDueCount: 1,
      todayCount: 5,
      limits: { maxReviewsPerDay: 2 },
    });

    await answerReview("today_a", "review");

    const after = await getSubjectReviewDueCounts(CLOCK);
    const rowsAfter = Object.fromEntries(after.subjects.map((row) => [row.subjectId, row]));

    expect(rowsAfter.today_a).toMatchObject({ reviewTodayCount: 1, todayCount: 2 });
    expect(rowsAfter.today_parent).toMatchObject({ reviewTodayCount: 3, todayCount: 4 });
  });

  it("should bound today by the app-wide reviews remaining", async () => {
    await setGlobalReviewLimit(3);
    await insertSubject("today_global", { cap: 0 });

    for (let i = 0; i < 5; i++) {
      await insertCard("today_global", "review");
    }

    await answerReview("today_global", "review");

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const row = counts.subjects.find((entry) => entry.subjectId === "today_global");

    expect(counts.reviewsRemainingToday).toBe(2);
    expect(row).toMatchObject({ reviewTodayCount: 5, todayCount: 2 });
  });

  it("should report no global remaining when the app-wide limit is 0", async () => {
    await setGlobalReviewLimit(0);
    await insertSubject("today_free");
    await insertCard("today_free", "review");

    const counts = await getSubjectReviewDueCounts(CLOCK);

    expect(counts.reviewsRemainingToday).toBeNull();
  });

  it("should attribute a placed card to the same subject in browser counts, due counts and the queue cap", async () => {
    await insertSubject("attr_source", { cap: 1 });
    await insertSubject("attr_placed", { cap: 1 });

    const topicId = await insertPlacedTopic("attr_placed");

    await insertCard("attr_source", "review", { topicId });
    await insertCard("attr_source", "review", { topicId });

    const browser = await countKnowledgeBitBrowserSubjects();
    const counts = await getSubjectReviewDueCounts(CLOCK);
    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);
    const browserBySubject = Object.fromEntries(browser.map((row) => [row.subjectId, row.count]));
    const dueBySubject = Object.fromEntries(counts.subjects.map((row) => [row.subjectId, row.dueCount]));

    expect(browserBySubject).toMatchObject({ attr_placed: 2 });
    expect(browserBySubject.attr_source ?? 0).toBe(0);
    expect(dueBySubject).toMatchObject({ attr_placed: 2, attr_source: 0 });
    expect(queue.cards).toHaveLength(1);
  });
});
