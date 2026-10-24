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
});
