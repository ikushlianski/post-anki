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

const dbName = `kb_review_pack_${randomUUID().replace(/-/g, "_")}`;
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
const { buildReviewPack } = await import("./knowledge-bit-review-pack.service.js");

let client: pg.Client;

const NOW = new Date("2090-03-10T12:00:00.000Z");
const HOUR = 3_600_000;

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

async function seedSubject(): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, subjectId]);

  return subjectId;
}

interface CardOptions {
  dueInHours?: number;
  reviewedHoursAgo?: number;
  undone?: boolean;
  extraVariants?: number;
}

async function seedCard(subjectId: string, options: CardOptions = {}): Promise<{ bitId: string; variantId: string }> {
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
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.')`,
    [variantId, bitId],
  );

  for (let index = 0; index < (options.extraVariants ?? 0); index += 1) {
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', $3, 'Q2?', 'A2.')`,
      [`kbqv_${randomUUID()}`, bitId, index + 1],
    );
  }

  if (options.dueInHours !== undefined) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, card_key, ease_factor, interval_days, due_at, last_reviewed_at, review_count, phase)
       VALUES ($1, '', 2.5, 3, $2, $3, 1, 'review')`,
      [bitId, new Date(NOW.getTime() + options.dueInHours * HOUR), new Date(NOW.getTime() - 5 * 86_400_000)],
    );
  }

  if (options.reviewedHoursAgo !== undefined) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at, card_key)
       VALUES ($1, $2, $3, 'good', false, $4, $5, '')`,
      [
        `kbreview_${randomUUID()}`,
        bitId,
        variantId,
        new Date(NOW.getTime() - options.reviewedHoursAgo * HOUR),
        options.undone ? NOW : null,
      ],
    );
  }

  return { bitId, variantId };
}

describe("buildReviewPack (real Postgres)", () => {
  it("should pack due cards of a subject studied within the last 3 days", async () => {
    const subjectId = await seedSubject();
    const studied = await seedCard(subjectId, { dueInHours: -1, reviewedHoursAgo: 71 });

    const pack = await buildReviewPack("UTC", NOW);

    expect(pack.cards.map((card) => card.variantId)).toContain(studied.variantId);
  });

  it("should leave out a subject last studied more than 3 days ago", async () => {
    const subjectId = await seedSubject();
    const stale = await seedCard(subjectId, { dueInHours: -1, reviewedHoursAgo: 73 });

    const pack = await buildReviewPack("UTC", NOW);

    expect(pack.cards.map((card) => card.variantId)).not.toContain(stale.variantId);
  });

  it("should not count an undone review as studying the subject", async () => {
    const subjectId = await seedSubject();
    const undone = await seedCard(subjectId, { dueInHours: -1, reviewedHoursAgo: 1, undone: true });

    const pack = await buildReviewPack("UTC", NOW);

    expect(pack.cards.map((card) => card.variantId)).not.toContain(undone.variantId);
  });

  it("should pack cards due within 24 hours but not later ones", async () => {
    const subjectId = await seedSubject();

    await seedCard(subjectId, { reviewedHoursAgo: 2 });
    const soon = await seedCard(subjectId, { dueInHours: 23 });
    const later = await seedCard(subjectId, { dueInHours: 25 });

    const ids = (await buildReviewPack("UTC", NOW)).cards.map((card) => card.variantId);

    expect(ids).toContain(soon.variantId);
    expect(ids).not.toContain(later.variantId);
  });

  it("should attach the card's other wordings as alternates", async () => {
    const subjectId = await seedSubject();
    const withAlternates = await seedCard(subjectId, { dueInHours: -1, reviewedHoursAgo: 2, extraVariants: 3 });

    const pack = await buildReviewPack("UTC", NOW);
    const card = pack.cards.find((candidate) => candidate.knowledgeBitId === withAlternates.bitId);

    expect(card?.alternates).toHaveLength(2);
    expect(card?.alternates.map((alternate) => alternate.variantId)).not.toContain(card?.variantId);
  });
});
