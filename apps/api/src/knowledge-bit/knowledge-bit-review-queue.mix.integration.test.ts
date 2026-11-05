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

const dbName = `kb_review_mix_${randomUUID().replace(/-/g, "_")}`;
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

const CLOCK = { tz: "UTC", now: new Date("2090-03-10T12:00:00.000Z") };
const LABELS = new Map<string, string>();

async function seedCard(subjectId: string, seen: boolean, label: string): Promise<void> {
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
      [bitId, new Date("2090-03-01T00:00:00.000Z")],
    );
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $2, $3, 'good', false, $4)`,
      [`kbr_${randomUUID()}`, bitId, variantId, new Date("2090-02-20T00:00:00.000Z")],
    );
  }

  LABELS.set(variantId, label);
}

async function setMix(value: boolean | null): Promise<void> {
  await client.query(`DELETE FROM app_settings`);

  if (value !== null) {
    await client.query(`INSERT INTO app_settings (id, mix_new_with_due) VALUES ('app', $1)`, [value]);
  }
}

const labelsOf = (cards: Array<{ variantId: string }>) => cards.map((card) => LABELS.get(card.variantId));

let subjectId: string;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  subjectId = `subj_${randomUUID()}`;
  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, 'Business')`, [subjectId]);

  for (const label of ["seen1", "seen2", "seen3"]) {
    await seedCard(subjectId, true, label);
  }

  for (const label of ["new1", "new2", "new3"]) {
    await seedCard(subjectId, false, label);
  }
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

describe("review queue mixing new cards with seen cards (real Postgres)", () => {
  it("should mix new cards between seen cards in a subject review when the learner never changed the setting", async () => {
    await setMix(null);

    const { cards } = await getKnowledgeBitReviewQueue(50, { subjectId }, CLOCK);

    expect(labelsOf(cards)).toEqual(["seen1", "new1", "seen2", "new2", "seen3", "new3"]);
  });

  it("should mix new cards between due cards in the all-subjects review when mixing is on", async () => {
    await setMix(true);

    const { cards } = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);

    expect(labelsOf(cards)).toEqual(["seen1", "new1", "seen2", "new2", "seen3", "new3"]);
  });

  it("should show new cards first in a subject review when mixing is off", async () => {
    await setMix(false);

    const { cards } = await getKnowledgeBitReviewQueue(50, { subjectId }, CLOCK);

    expect(labelsOf(cards)).toEqual(["new1", "new2", "new3", "seen1", "seen2", "seen3"]);
  });

  it("should show every due card before the new cards in the all-subjects review when mixing is off", async () => {
    await setMix(false);

    const { cards } = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);

    expect(labelsOf(cards)).toEqual(["seen1", "seen2", "seen3", "new1", "new2", "new3"]);
  });

  it("should keep a short batch balanced between new and seen cards", async () => {
    await setMix(true);

    const { cards } = await getKnowledgeBitReviewQueue(4, { subjectId }, CLOCK);

    expect(labelsOf(cards)).toEqual(["seen1", "new1", "seen2", "new2"]);
  });
});
