import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { reviewCardsResponseSchema } from "@post-anki/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `kb_review_parent_mix_${randomUUID().replace(/-/g, "_")}`;
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
const CLOCK = { tz: "UTC", now: NOW };
const DAY = 86_400_000;
const CHILD_OF = new Map<string, string>();

interface SeededCard {
  bitId: string;
  variantId: string;
}

async function seedSubject(name: string, parentId: string | null): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [subjectId, name, parentId]);

  return subjectId;
}

async function seedCard(subjectId: string, seen: boolean, label: string): Promise<SeededCard> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, 'A.')`,
    [variantId, bitId, label],
  );

  if (seen) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count) VALUES ($1, 2.5, 10, $2, 1)`,
      [bitId, new Date(NOW.getTime() - 5 * DAY)],
    );
  }

  CHILD_OF.set(variantId, subjectId);

  return { bitId, variantId };
}

async function seedReview(bitId: string, variantId: string, reviewedAt: Date): Promise<string> {
  const id = `kbr_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $2, $3, 'good', false, $4)`,
    [id, bitId, variantId, reviewedAt],
  );

  return id;
}

const idsOf = (cards: Array<{ variantId: string }>) => cards.map((card) => card.variantId);

let parentId: string;
let childA: string;
let childB: string;
let aSeen: SeededCard[] = [];
let bSeen: SeededCard[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  parentId = await seedSubject("Business", null);
  childA = await seedSubject("Negotiations", parentId);
  childB = await seedSubject("Accounting", parentId);

  for (let i = 0; i < 10; i++) {
    aSeen.push(await seedCard(childA, true, `a-seen-${i}`));
    bSeen.push(await seedCard(childB, true, `b-seen-${i}`));
    await seedCard(childA, false, `a-new-${i}`);
    await seedCard(childB, false, `b-new-${i}`);
  }

  for (const card of aSeen) {
    for (let r = 0; r < 3; r++) {
      await seedReview(card.bitId, card.variantId, new Date(NOW.getTime() - 2 * DAY));
    }
  }
}, 60_000);

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

describe("parent subject review mix (real Postgres)", () => {
  it("should draw cards from every sub-subject, more from the recently studied one, over a month of sessions", async () => {
    const shares = new Map<string, number>([[childA, 0], [childB, 0]]);

    for (let day = 0; day < 30; day++) {
      const clock = { tz: "UTC", now: new Date(NOW.getTime() + day * DAY) };
      const { cards } = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, clock);

      for (const card of cards) {
        const child = CHILD_OF.get(card.variantId)!;

        shares.set(child, (shares.get(child) ?? 0) + 1);
      }
    }

    expect(shares.get(childA)!).toBeGreaterThan(shares.get(childB)!);
    expect(shares.get(childB)!).toBeGreaterThan(0);
  }, 60_000);

  it("should return half new and half already-seen cards in one page", async () => {
    const { cards } = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);

    expect(cards).toHaveLength(10);
    expect(cards.filter((card) => card.phase === "new")).toHaveLength(5);
    expect(new Set(cards.map((card) => CHILD_OF.get(card.variantId))).size).toBe(2);
  });

  it("should return the same cards in the same order on repeated requests", async () => {
    const first = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);
    const second = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);

    expect(idsOf(second.cards)).toEqual(idsOf(first.cards));
  });

  it("should not reorder the queue because of a review made earlier today", async () => {
    const before = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);
    const reviewIds: string[] = [];

    for (const card of bSeen) {
      for (let r = 0; r < 5; r++) {
        reviewIds.push(await seedReview(card.bitId, card.variantId, NOW));
      }
    }

    const after = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);

    await client.query(`DELETE FROM knowledge_bit_reviews WHERE id = ANY($1)`, [reviewIds]);
    expect(idsOf(after.cards)).toEqual(idsOf(before.cards));
  });

  it("should surface the other cards once a whole page has been graded", async () => {
    const page = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);
    const later = new Date(NOW.getTime() + 10 * DAY);
    const bitIds = page.cards.map((card) => card.knowledgeBitId);

    await client.query(`UPDATE knowledge_bit_schedules SET due_at = $2 WHERE knowledge_bit_id = ANY($1)`, [bitIds, later]);

    for (const card of page.cards.filter((entry) => entry.phase === "new")) {
      await client.query(
        `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count) VALUES ($1, 2.5, 10, $2, 1)`,
        [card.knowledgeBitId, later],
      );
    }

    const refetch = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);
    const gradedIds = new Set(idsOf(page.cards));

    const newBitIds = page.cards.filter((entry) => entry.phase === "new").map((entry) => entry.knowledgeBitId);

    await client.query(`DELETE FROM knowledge_bit_schedules WHERE knowledge_bit_id = ANY($1)`, [newBitIds]);
    await client.query(`UPDATE knowledge_bit_schedules SET due_at = $2 WHERE knowledge_bit_id = ANY($1)`, [
      bitIds,
      new Date(NOW.getTime() - 5 * DAY),
    ]);

    expect(refetch.cards).toHaveLength(10);
    expect(refetch.cards.some((card) => gradedIds.has(card.variantId))).toBe(false);
  });

  it("should always serve due learning cards before cards that are not due yet", async () => {
    const root = await seedSubject("Learning root", null);
    const left = await seedSubject("Learning left", root);
    const right = await seedSubject("Learning right", root);
    const dueIds = new Set<string>();

    for (const child of [left, right]) {
      for (let i = 0; i < 3; i++) {
        const due = await seedCard(child, true, `due-${i}`);
        const waiting = await seedCard(child, true, `wait-${i}`);

        await client.query(
          `UPDATE knowledge_bit_schedules SET phase = 'learning', due_at = $2 WHERE knowledge_bit_id = $1`,
          [due.bitId, new Date(NOW.getTime() - 60_000)],
        );
        await client.query(`UPDATE knowledge_bit_schedules SET due_at = $2 WHERE knowledge_bit_id = $1`, [
          waiting.bitId,
          new Date(NOW.getTime() + 3 * DAY),
        ]);
        dueIds.add(due.variantId);
      }
    }

    const { cards } = await getKnowledgeBitReviewQueue(6, { subjectId: root }, CLOCK);

    expect(cards).toHaveLength(6);
    expect(cards.every((card) => dueIds.has(card.variantId))).toBe(true);
  });

  it("should return no cards and the same limit fields when the daily limit is reached, and still serve review-ahead", async () => {
    await updateAdminSettings({ maxReviewsPerDay: 2 });
    const reviewIds = [
      await seedReview(`kb_${randomUUID()}`, `kbqv_${randomUUID()}`, NOW),
      await seedReview(`kb_${randomUUID()}`, `kbqv_${randomUUID()}`, NOW),
    ];

    const blocked = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);
    const ahead = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, { ...CLOCK, aheadDays: 1 });

    await client.query(`DELETE FROM knowledge_bit_reviews WHERE id = ANY($1)`, [reviewIds]);
    await client.query(`DELETE FROM app_settings`);

    expect(blocked.cards).toHaveLength(0);
    expect(blocked.limitReached).toBe(true);
    expect(blocked.reviewedToday).toBe(2);
    expect(blocked.limit).toBe(2);
    expect(blocked.nextDueAt).toBe("2090-03-11T00:00:00.000Z");
    expect(ahead.limitReached).toBe(true);
    expect(ahead.cards).toHaveLength(10);
  });

  it("should keep the plain subject order for a parent with a single sub-subject or none", async () => {
    const onlyParent = await seedSubject("Single", null);
    const onlyChild = await seedSubject("Single child", onlyParent);
    const lonely = await seedSubject("No children", null);

    for (const label of ["s1", "s2"]) {
      await seedCard(onlyChild, true, `${label}-child`);
      await seedCard(lonely, true, `${label}-lonely`);
    }

    for (const label of ["n1", "n2"]) {
      await seedCard(onlyChild, false, `${label}-child`);
      await seedCard(lonely, false, `${label}-lonely`);
    }

    const viaParent = await getKnowledgeBitReviewQueue(50, { subjectId: onlyParent }, CLOCK);
    const viaChild = await getKnowledgeBitReviewQueue(50, { subjectId: onlyChild }, CLOCK);
    const leaf = await getKnowledgeBitReviewQueue(50, { subjectId: lonely }, CLOCK);

    expect(idsOf(viaParent.cards)).toEqual(idsOf(viaChild.cards));
    expect(viaChild.cards.map((card) => card.prompt)).toEqual([
      "s1-child",
      "n1-child",
      "s2-child",
      "n2-child",
    ]);
    expect(leaf.cards.map((card) => card.prompt)).toEqual([
      "s1-lonely",
      "n1-lonely",
      "s2-lonely",
      "n2-lonely",
    ]);
  });

  it("should produce a response that the shared review-cards schema accepts", async () => {
    const queue = await getKnowledgeBitReviewQueue(10, { subjectId: parentId }, CLOCK);

    expect(reviewCardsResponseSchema.safeParse(JSON.parse(JSON.stringify(queue))).success).toBe(true);
  });
});
