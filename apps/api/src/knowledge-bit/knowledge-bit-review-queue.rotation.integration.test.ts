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

const dbName = `kb_rotation_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();
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
const { pickAlternateVariant } = await import("./knowledge-bit-review-alt-variant.repo.js");
const { getDb } = await import("../db/client.js");

let client: pg.Client;

const NOW = new Date("2090-03-10T12:00:00.000Z");
const CLOCK = { tz: "UTC", now: NOW };

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

async function seedPiece(kinds: string[]): Promise<{ bitId: string; variantIds: string[] }> {
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, `ks_${randomUUID()}`],
  );
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count, phase) VALUES ($1, 2.5, 0, $2, 1, 'learning')`,
    [bitId, new Date(NOW.getTime() - 60_000)],
  );

  const variantIds: string[] = [];

  for (const [order, kind] of kinds.entries()) {
    const variantId = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, $3, $4, 'Q', 'A')`,
      [variantId, bitId, kind, order],
    );
    variantIds.push(variantId);
  }

  return { bitId, variantIds };
}

async function recordShown(bitId: string, variantId: string, secondsAgo: number): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $2, $3, 'good', false, $4)`,
    [`kbreview_${randomUUID()}`, bitId, variantId, new Date(NOW.getTime() - secondsAgo * 1000)],
  );
}

const DAY_MS = 86_400_000;

async function recordHistory(
  bitId: string,
  variantId: string,
  daysAgo: number,
  grade: string,
  prevIntervalDays: number,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, prev_schedule) VALUES ($1, $2, $3, $4, false, $5, $6)`,
    [
      `kbreview_${randomUUID()}`,
      bitId,
      variantId,
      grade,
      new Date(NOW.getTime() - daysAgo * DAY_MS),
      JSON.stringify({ intervalDays: prevIntervalDays }),
    ],
  );
}

async function seedDifficultCard(): Promise<{ bitId: string; plainId: string; rewordedId: string }> {
  const { bitId, variantIds } = await seedPiece(["basic", "reworded"]);
  const plainId = variantIds[0] as string;

  await recordHistory(bitId, plainId, 12, "again", 0);
  await recordHistory(bitId, plainId, 10, "again", 1);
  await recordHistory(bitId, plainId, 8, "good", 1);
  await recordHistory(bitId, plainId, 6, "good", 2);

  return { bitId, plainId, rewordedId: variantIds[1] as string };
}

async function recordRehearsal(variantId: string, secondsAgo: number): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback, created_at) VALUES ($1, $2, '', 8, 'Ok', 'rehearsal', $3)`,
    [`kbvattempt_${randomUUID()}`, variantId, new Date(NOW.getTime() - secondsAgo * 1000)],
  );
}

async function nextVariantId(bitId: string): Promise<string | undefined> {
  const queue = await getKnowledgeBitReviewQueue(10, { knowledgeBitId: bitId }, CLOCK);

  return queue.cards[0]?.variantId;
}

describe("review queue variation rotation (real Postgres)", () => {
  it("should show the preferred kind first when a piece has never been reviewed", async () => {
    const { bitId, variantIds } = await seedPiece(["wh_question", "basic", "fill_in_the_blank"]);

    expect(await nextVariantId(bitId)).toBe(variantIds[1]);
  });

  it("should never show the same variation twice in a row when a piece has several", async () => {
    const { bitId, variantIds } = await seedPiece(["basic", "fill_in_the_blank", "wh_question"]);
    const shown: string[] = [];

    for (let step = 0; step < 6; step++) {
      const next = await nextVariantId(bitId);

      expect(next).toBeDefined();
      shown.push(next as string);
      await recordShown(bitId, next as string, 60 - step * 10);
    }

    shown.slice(1).forEach((variantId, index) => expect(variantId).not.toBe(shown[index]));
    expect(new Set(shown.slice(0, 3))).toEqual(new Set(variantIds));
  });

  it("should show the least recently shown variation and ignore a variation whose review was undone", async () => {
    const { bitId, variantIds } = await seedPiece(["basic", "fill_in_the_blank"]);

    await recordShown(bitId, variantIds[0] as string, 100);
    await recordShown(bitId, variantIds[1] as string, 50);

    expect(await nextVariantId(bitId)).toBe(variantIds[0]);

    await client.query(`UPDATE knowledge_bit_reviews SET undone_at = $1 WHERE variant_id = $2`, [NOW, variantIds[1]]);
    await recordShown(bitId, variantIds[0] as string, 10);

    expect(await nextVariantId(bitId)).toBe(variantIds[1]);
  });

  it("should keep showing the only variation of a piece with one", async () => {
    const { bitId, variantIds } = await seedPiece(["fill_in_the_blank"]);

    await recordShown(bitId, variantIds[0] as string, 5);

    expect(await nextVariantId(bitId)).toBe(variantIds[0]);
  });

  it("should not let a practice round change which wording the next real review shows", async () => {
    const { bitId, variantIds } = await seedPiece(["basic", "fill_in_the_blank"]);

    await recordShown(bitId, variantIds[0] as string, 100);
    await recordShown(bitId, variantIds[1] as string, 50);
    await recordRehearsal(variantIds[0] as string, 5);

    expect(await nextVariantId(bitId)).toBe(variantIds[0]);
  });

  it("should offer the other wording as follow-up even after the shown wording was practised", async () => {
    const { bitId, variantIds } = await seedPiece(["basic", "fill_in_the_blank"]);

    await recordShown(bitId, variantIds[1] as string, 100);
    await recordShown(bitId, variantIds[0] as string, 50);
    await recordRehearsal(variantIds[1] as string, 5);

    const alternate = await pickAlternateVariant(bitId, variantIds[0] as string, NOW, getDb());

    expect(alternate?.variantId).toBe(variantIds[1]);
  });

  it("should rotate in the approved reworded version while the card is difficult", async () => {
    const { bitId, plainId, rewordedId } = await seedDifficultCard();

    await recordShown(bitId, plainId, 30);

    expect(await nextVariantId(bitId)).toBe(rewordedId);

    await recordShown(bitId, rewordedId, 10);

    expect(await nextVariantId(bitId)).toBe(plainId);

    const alternate = await pickAlternateVariant(bitId, plainId, NOW, getDb());

    expect(alternate?.variantId).toBe(rewordedId);
  });

  it("should never show a reworded version for a card that is not difficult", async () => {
    const { bitId, variantIds } = await seedPiece(["basic", "reworded"]);

    await recordHistory(bitId, variantIds[0] as string, 12, "good", 0);
    await recordHistory(bitId, variantIds[0] as string, 6, "good", 3);

    expect(await nextVariantId(bitId)).toBe(variantIds[0]);

    const alternate = await pickAlternateVariant(bitId, variantIds[0] as string, NOW, getDb());

    expect(alternate).toBeNull();
  });

  it("should stop showing the reworded version once the card is retired", async () => {
    const { bitId, plainId, rewordedId } = await seedDifficultCard();

    await recordHistory(bitId, plainId, 4, "good", 8);
    await recordHistory(bitId, plainId, 1, "easy", 12);

    expect(await nextVariantId(bitId)).toBe(plainId);
    expect(await nextVariantId(bitId)).not.toBe(rewordedId);
    expect(await pickAlternateVariant(bitId, plainId, NOW, getDb())).toBeNull();
  });

  it("should count a reworded version as the same card in the queue instead of a new one", async () => {
    const { bitId } = await seedDifficultCard();
    const queue = await getKnowledgeBitReviewQueue(10, { knowledgeBitId: bitId }, CLOCK);

    expect(queue.cards).toHaveLength(1);
    expect(queue.cards[0]?.cardKey).toBe("");
  });

  it("should update the card's shared schedule when a reworded version is graded", async () => {
    const { bitId, rewordedId } = await seedDifficultCard();
    const outcome = await recordKnowledgeBitReview({ variantId: rewordedId, grade: "good" }, NOW);
    const schedule = await client.query(
      `SELECT card_key, review_count FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
      [bitId],
    );
    const review = await client.query(
      `SELECT card_key FROM knowledge_bit_reviews WHERE variant_id = $1`,
      [rewordedId],
    );

    expect(outcome.ok).toBe(true);
    expect(schedule.rows).toHaveLength(1);
    expect(schedule.rows[0]).toMatchObject({ card_key: "", review_count: 2 });
    expect(review.rows[0]?.card_key).toBe("");
  });
});
