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

const dbName = `kb_export_${randomUUID().replace(/-/g, "_")}`;
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
const { streamApprovedCards, EXPORT_BATCH_SIZE } = await import("./knowledge-bit-export.repo.js");

let client: pg.Client;

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

const NOW = new Date("2026-10-10T12:00:00.000Z");

async function seedSubject(name: string, parentId: string | null = null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, name, parentId]);

  return id;
}

async function seedBit(subjectId: string | null, approvalState = "approved", body = "Fact"): Promise<string> {
  const bitId = `kb_${randomUUID()}`;
  const sourceId = `ks_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, subject_id) VALUES ($1, 'paste', $2)`, [sourceId, subjectId]);
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, $4)`,
    [bitId, sourceId, body, approvalState],
  );

  return bitId;
}

async function seedVariant(bitId: string, prompt = "Q?", answer = "A.", kind = "wh_question"): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, $5, 0, $3, $4)`,
    [id, bitId, prompt, answer, kind],
  );

  return id;
}

async function collect() {
  const cards = [];

  for await (const batch of streamApprovedCards(NOW)) {
    cards.push(...batch);
  }

  return cards;
}

describe("streamApprovedCards (real Postgres)", () => {
  it("should export only approved cards with question, answer, example, subject, links, schedule and review history", async () => {
    const subject = await seedSubject("Export Subject");
    const approved = await seedBit(subject, "approved", "Fact");
    const pending = await seedBit(subject, "pending");

    await seedVariant(approved, "Why?", "Because.");
    await seedVariant(pending, "Hidden?", "Yes");
    await client.query(
      `UPDATE knowledge_bits SET background = 'An example', source_links = '["https://a.test"]'::jsonb WHERE id = $1`,
      [approved],
    );
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, lapses, review_count, phase) VALUES ($1, 2.1, 6, $2, 2, 3, 'review')`,
      [approved, "2026-11-01T00:00:00.000Z"],
    );
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $3, 'v', 'good', true, '2026-10-01T00:00:00Z'), ($2, $3, 'v', 'again', false, '2026-10-02T00:00:00Z')`,
      [`r_${randomUUID()}`, `r_${randomUUID()}`, approved],
    );
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, undone_at) VALUES ($1, $2, 'v', 'easy', false, now())`,
      [`r_${randomUUID()}`, approved],
    );

    const cards = (await collect()).filter((card) => card.subject === "Export Subject");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: approved,
      question: "Why?",
      answer: "Because.",
      example: "An example",
      sourceLinks: ["https://a.test"],
      state: "review",
      dueAt: "2026-11-01T00:00:00.000Z",
      intervalDays: 6,
      ease: 2.1,
      lapses: 2,
      reviewCount: 3,
    });
    expect(cards[0]?.reviews.map((review) => review.grade)).toEqual(["good", "again"]);
  });

  it("should export every card when there are more than one batch", async () => {
    const subject = await seedSubject("Many");

    for (let i = 0; i < EXPORT_BATCH_SIZE + 5; i++) {
      await seedVariant(await seedBit(subject), `Q${i}`, "A");
    }

    const cards = (await collect()).filter((card) => card.subject === "Many");

    expect(cards).toHaveLength(EXPORT_BATCH_SIZE + 5);
    expect(new Set(cards.map((card) => card.id)).size).toBe(EXPORT_BATCH_SIZE + 5);
  }, 60_000);
});

describe("streamApprovedCards topic, tags and extra questions (real Postgres)", () => {
  it("should export the topic, tags, added date and every other current question of a card", async () => {
    const subject = await seedSubject("Rich Subject");
    const bit = await seedBit(subject);
    const topic = `top_${randomUUID()}`;

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, 'm', 'c', 'Joins', 0)`,
      [topic],
    );
    await client.query(`UPDATE knowledge_bits SET topic_id = $1 WHERE id = $2`, [topic, bit]);
    await seedVariant(bit, "Basic?", "Yes", "basic");
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'fill_in_the_blank', 1, 'Fill __', 'x')`,
      [`kbqv_${randomUUID()}`, bit],
    );
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at) VALUES ($1, $2, 'wh_question', 2, 'Old?', 'old', now())`,
      [`kbqv_${randomUUID()}`, bit],
    );

    const tagId = `tag_${randomUUID()}`;

    await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, 'Zeta', $2), ($3, 'Alpha', $4)`, [
      tagId,
      `zeta-${tagId}`,
      `tag_${randomUUID()}`,
      `alpha-${tagId}`,
    ]);
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) SELECT 'ta_' || id, id, 'knowledgeBit', $1 FROM tags WHERE normalized_name IN ($2, $3)`,
      [bit, `zeta-${tagId}`, `alpha-${tagId}`],
    );

    const card = (await collect()).find((c) => c.id === bit);

    expect(card?.tags).toEqual(["Alpha", "Zeta"]);
    expect(card?.otherQuestions).toEqual([{ question: "Fill __", answer: "x" }]);
    expect(card?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(card?.topic).toBe("Joins");
  });
});
