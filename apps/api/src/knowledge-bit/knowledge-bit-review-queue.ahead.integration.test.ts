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

const dbName = `kb_review_ahead_${randomUUID().replace(/-/g, "_")}`;
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

async function queueIds(aheadDays?: number): Promise<string[]> {
  const queue = await getKnowledgeBitReviewQueue(50, undefined, { tz: "UTC", now: NOW, aheadDays });

  return queue.cards.map((card) => card.variantId);
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

describe("getKnowledgeBitReviewQueue learn ahead", () => {
  it("should leave cards that are not due out of the queue by default", async () => {
    const due = await seedCard(new Date(NOW.getTime() - DAY));
    const tomorrow = await seedCard(new Date(NOW.getTime() + DAY));
    const ids = await queueIds();

    expect(ids).toContain(due.variantId);
    expect(ids).not.toContain(tomorrow.variantId);
    expect(await queueIds(0)).toEqual(ids);
  });

  it("should include cards due within the window and list due cards before them", async () => {
    const due = await seedCard(new Date(NOW.getTime() - 3 * DAY));
    const tomorrow = await seedCard(new Date("2090-03-11T10:00:00.000Z"));
    const inThreeDays = await seedCard(new Date("2090-03-13T10:00:00.000Z"));
    const inTenDays = await seedCard(new Date("2090-03-20T10:00:00.000Z"));
    const oneDay = await queueIds(1);
    const threeDays = await queueIds(3);

    expect(oneDay).toContain(tomorrow.variantId);
    expect(oneDay).not.toContain(inThreeDays.variantId);
    expect(threeDays).toContain(inThreeDays.variantId);
    expect(threeDays).not.toContain(inTenDays.variantId);
    expect(threeDays.indexOf(due.variantId)).toBeLessThan(threeDays.indexOf(tomorrow.variantId));
    expect(threeDays.indexOf(tomorrow.variantId)).toBeLessThan(threeDays.indexOf(inThreeDays.variantId));
  });

  it("should keep a suspended card out even when learning ahead", async () => {
    const hidden = await seedCard(new Date("2090-03-11T10:00:00.000Z"));

    await client.query(`UPDATE knowledge_bit_schedules SET suspended_at = $1 WHERE knowledge_bit_id = $2`, [
      NOW,
      hidden.bitId,
    ]);

    expect(await queueIds(7)).not.toContain(hidden.variantId);
  });
});
