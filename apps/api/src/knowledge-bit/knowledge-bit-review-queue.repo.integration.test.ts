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

const dbName = `kb_review_queue_${randomUUID().replace(/-/g, "_")}`;
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
const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");

let client: pg.Client;

const CLOCK = { tz: "UTC", now: new Date("2090-03-10T12:00:00.000Z") };

async function listKnowledgeBitReviewCards(
  limit: number,
  filter: { tagId?: string; topicId?: string; knowledgeBitId?: string } | undefined,
  clock: { tz: string; now: Date } = CLOCK,
) {
  return (await getKnowledgeBitReviewQueue(limit, filter, clock)).cards;
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

async function seedBit(
  approvalState: "approved" | "pending" = "approved",
  options: { background?: string; topicId?: string } = {},
): Promise<string> {
  const knowledgeBitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, background, topic_id) VALUES ($1, $2, 0, 'SECRET BIT BODY', $3, $4, $5)`,
    [knowledgeBitId, `ks_${randomUUID()}`, approvalState, options.background ?? null, options.topicId ?? null],
  );

  return knowledgeBitId;
}

async function seedVariant(
  knowledgeBitId: string,
  superseded = false,
  kind = "wh_question",
): Promise<string> {
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at) VALUES ($1, $2, $3, 0, 'Why a handshake?', 'To agree on sequence numbers.', $4)`,
    [variantId, knowledgeBitId, kind, superseded ? new Date() : null],
  );

  return variantId;
}

async function seedSchedule(knowledgeBitId: string, dueAt: Date): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count) VALUES ($1, 2.5, 10, $2, 1)`,
    [knowledgeBitId, dueAt],
  );
}

async function seedStepSchedule(
  knowledgeBitId: string,
  dueAt: Date,
  phase: "learning" | "relearning",
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count, phase, learning_step, lapses) VALUES ($1, 2.5, 0, $2, 1, $3, 0, 0)`,
    [knowledgeBitId, dueAt, phase],
  );
}

async function seedNewCardReviews(total: number, reviewedAt: Date, undone = false): Promise<void> {
  for (let i = 0; i < total; i++) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at) VALUES ($1, $2, $3, 'good', true, $4, $5)`,
      [`kbreview_${randomUUID()}`, `kb_${randomUUID()}`, `kbqv_${randomUUID()}`, reviewedAt, undone ? reviewedAt : null],
    );
  }
}

const daysFrom = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);

describe("listKnowledgeBitReviewCards (real Postgres)", () => {
  it("should return the reference answer and background but never the bit's own text", async () => {
    const knowledgeBitId = await seedBit("approved", { background: "Networking basics" });
    const variantId = await seedVariant(knowledgeBitId);

    const cards = await listKnowledgeBitReviewCards(10, { knowledgeBitId });

    expect(cards).toEqual([
      {
        variantId,
        knowledgeBitId,
        kind: "wh_question",
        prompt: "Why a handshake?",
        answer: "To agree on sequence numbers.",
        background: "Networking basics",
        phase: "new",
        intervalPreview: { again: 60, hard: 330, good: 600, easy: 4 * 86_400 },
      },
    ]);
    expect(JSON.stringify(cards)).not.toContain("SECRET BIT BODY");
  });

  it("should never serve a card whose bit is still awaiting approval", async () => {
    const knowledgeBitId = await seedBit("pending");

    await seedVariant(knowledgeBitId);

    expect(await listKnowledgeBitReviewCards(10, { knowledgeBitId })).toEqual([]);
  });

  it("should skip a superseded question left over from an edited bit", async () => {
    const knowledgeBitId = await seedBit();

    await seedVariant(knowledgeBitId, true);

    expect(await listKnowledgeBitReviewCards(10, { knowledgeBitId })).toEqual([]);
  });

  it("should never serve cards from a topic the learner dropped", async () => {
    const topicId = `topic_${randomUUID()}`;

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", learning_status) VALUES ($1, $2, $3, 'Dropped topic', 0, 'skipping')`,
      [topicId, `module_${randomUUID()}`, `curriculum_${randomUUID()}`],
    );

    const knowledgeBitId = await seedBit("approved", { topicId });

    await seedVariant(knowledgeBitId);

    expect(await listKnowledgeBitReviewCards(10, { knowledgeBitId })).toEqual([]);
  });

  it("should mark a card as new until its bit is first graded, then as learning", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    expect((await listKnowledgeBitReviewCards(10, { knowledgeBitId }))[0]?.phase).toBe("new");

    await recordKnowledgeBitReview({ variantId, grade: "good" });

    expect((await listKnowledgeBitReviewCards(10, { knowledgeBitId }))[0]?.phase).toBe("learning");
  });

  it("should serve a due bit before a never-reviewed one", async () => {
    const dueBit = await seedBit();
    const dueVariant = await seedVariant(dueBit);
    const freshBit = await seedBit();
    const freshVariant = await seedVariant(freshBit);

    await seedSchedule(dueBit, daysFrom(CLOCK.now, -1));

    const ids = (await listKnowledgeBitReviewCards(500, undefined)).map((card) => card.variantId);

    expect(ids.indexOf(dueVariant)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(dueVariant)).toBeLessThan(ids.indexOf(freshVariant));
  });

  it("should leave a bit that is not due yet out of the unscoped queue but serve it when scoped to that bit", async () => {
    const bitId = await seedBit();
    const variantId = await seedVariant(bitId);

    await seedSchedule(bitId, daysFrom(CLOCK.now, 3));

    const unscoped = (await listKnowledgeBitReviewCards(500, undefined)).map((card) => card.variantId);
    const scoped = (await listKnowledgeBitReviewCards(10, { knowledgeBitId: bitId })).map((card) => card.variantId);

    expect(unscoped).not.toContain(variantId);
    expect(scoped).toEqual([variantId]);
  });

  it("should serve one card per bit, preferring fill-in-the-blank over a wh question", async () => {
    const bitId = await seedBit();

    await seedVariant(bitId, false, "wh_question");

    const fillBlank = await seedVariant(bitId, false, "fill_in_the_blank");
    const cards = (await listKnowledgeBitReviewCards(500, undefined)).filter(
      (card) => card.knowledgeBitId === bitId,
    );

    expect(cards.map((card) => card.variantId)).toEqual([fillBlank]);
  });

  it("should prefer a basic card over every other kind of the same bit", async () => {
    const bitId = await seedBit();

    await seedVariant(bitId, false, "fill_in_the_blank");

    const basic = await seedVariant(bitId, false, "basic");
    const cards = (await listKnowledgeBitReviewCards(500, undefined)).filter(
      (card) => card.knowledgeBitId === bitId,
    );

    expect(cards.map((card) => card.variantId)).toEqual([basic]);
  });

  it("should stop serving new cards once 20 were started today but keep serving due ones", async () => {
    const now = new Date("2091-05-10T12:00:00.000Z");
    const dueBit = await seedBit();
    const dueVariant = await seedVariant(dueBit);
    const freshBit = await seedBit();
    const freshVariant = await seedVariant(freshBit);

    await seedSchedule(dueBit, daysFrom(now, -1));
    await seedNewCardReviews(20, now);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, { tz: "UTC", now });
    const ids = queue.cards.map((card) => card.variantId);

    expect(queue.newRemainingToday).toBe(0);
    expect(ids).toContain(dueVariant);
    expect(ids).not.toContain(freshVariant);
    expect(queue.counts.new).toBe(0);
    expect(queue.counts.review).toBeGreaterThanOrEqual(1);
  });

  it("should count the new-card day in the learner's time zone", async () => {
    const now = new Date("2092-05-10T10:00:00.000Z");
    const reviewedAt = new Date("2092-05-10T09:00:00.000Z");

    await seedNewCardReviews(1, new Date("2092-05-09T20:00:00.000Z"));
    await seedNewCardReviews(1, reviewedAt);
    await seedNewCardReviews(1, new Date("2092-05-09T23:30:00.000Z"));

    const utc = await getKnowledgeBitReviewQueue(1, undefined, { tz: "UTC", now });
    const auckland = await getKnowledgeBitReviewQueue(1, undefined, { tz: "Pacific/Auckland", now });

    expect(utc.newRemainingToday).toBe(19);
    expect(auckland.newRemainingToday).toBe(17);
  });

  it("should not count an undone new-card review against today's cap", async () => {
    const now = new Date("2093-05-10T12:00:00.000Z");

    await seedNewCardReviews(5, now, true);

    const queue = await getKnowledgeBitReviewQueue(1, undefined, { tz: "UTC", now });

    expect(queue.newRemainingToday).toBe(20);
  });

  it("should report the earliest future due time when nothing is due right now", async () => {
    const now = new Date("2094-05-10T12:00:00.000Z");
    const bitId = await seedBit();

    await seedVariant(bitId);
    await seedSchedule(bitId, daysFrom(now, 2));

    const queue = await getKnowledgeBitReviewQueue(1, { knowledgeBitId: bitId }, { tz: "UTC", now });

    expect(queue.nextDueAt).toBe(daysFrom(now, 2).toISOString());
    expect(queue.counts).toEqual({ new: 0, learning: 0, review: 0 });
  });

  it("should point to the next local midnight when only capped new cards are waiting", async () => {
    const now = new Date("2095-05-10T12:00:00.000Z");

    await seedNewCardReviews(20, now);
    await seedVariant(await seedBit());

    const queue = await getKnowledgeBitReviewQueue(500, undefined, { tz: "UTC", now });

    expect(queue.newRemainingToday).toBe(0);
    expect(queue.nextDueAt).toBe("2095-05-11T00:00:00.000Z");
  });

  it("should serve only cards from the chosen topic when the review is scoped to a topic", async () => {
    const topicId = `topic_${randomUUID()}`;

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", learning_status) VALUES ($1, $2, $3, 'Scoped topic', 0, 'active')`,
      [topicId, `module_${randomUUID()}`, `curriculum_${randomUUID()}`],
    );

    const inTopic = await seedVariant(await seedBit("approved", { topicId }));

    await seedVariant(await seedBit());

    const cards = await listKnowledgeBitReviewCards(50, { topicId });

    expect(cards.map((card) => card.variantId)).toEqual([inTopic]);
  });

  it("should serve only cards from bits carrying the chosen tag when the review is scoped to a tag", async () => {
    const tagId = `tag_${randomUUID()}`;
    const taggedBit = await seedBit();
    const taggedVariant = await seedVariant(taggedBit);

    await seedVariant(await seedBit());
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, 'knowledgeBit', $3)`,
      [`ta_${randomUUID()}`, tagId, taggedBit],
    );

    const cards = await listKnowledgeBitReviewCards(50, { tagId });

    expect(cards.map((card) => card.variantId)).toEqual([taggedVariant]);
  });

  it("should serve learning and relearning cards ahead of due reviews and show minute previews", async () => {
    const now = new Date("2095-05-10T12:00:00.000Z");
    const reviewBit = await seedBit();
    const reviewVariant = await seedVariant(reviewBit);
    const learningBit = await seedBit();
    const learningVariant = await seedVariant(learningBit);

    await seedSchedule(reviewBit, daysFrom(now, -3));
    await seedStepSchedule(learningBit, new Date(now.getTime() - 60_000), "learning");

    const queue = await getKnowledgeBitReviewQueue(500, undefined, { tz: "UTC", now });
    const ids = queue.cards.map((card) => card.variantId);
    const learningCard = queue.cards.find((card) => card.variantId === learningVariant);

    expect(ids.indexOf(learningVariant)).toBeLessThan(ids.indexOf(reviewVariant));
    expect(learningCard?.phase).toBe("learning");
    expect(learningCard?.intervalPreview.again).toBe(60);
    expect(queue.counts.learning).toBeGreaterThanOrEqual(1);
  });

  it("should serve a learning card due within 20 minutes when nothing else is left, but not one due later", async () => {
    const now = new Date("2096-05-10T12:00:00.000Z");
    const soonBit = await seedBit();
    const soonVariant = await seedVariant(soonBit);
    const laterBit = await seedBit();
    const laterVariant = await seedVariant(laterBit);

    await seedStepSchedule(soonBit, new Date(now.getTime() + 10 * 60_000), "relearning");
    await seedStepSchedule(laterBit, new Date(now.getTime() + 40 * 60_000), "learning");

    const queue = await getKnowledgeBitReviewQueue(500, undefined, { tz: "UTC", now });
    const ids = queue.cards.map((card) => card.variantId);

    expect(ids).toContain(soonVariant);
    expect(ids).not.toContain(laterVariant);
  });
});
