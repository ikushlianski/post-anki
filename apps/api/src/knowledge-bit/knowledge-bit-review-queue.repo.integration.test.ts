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
const { listKnowledgeBitReviewCards } = await import("./knowledge-bit-review-queue.repo.js");
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");

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

async function seedVariant(knowledgeBitId: string, superseded = false): Promise<string> {
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at) VALUES ($1, $2, 'wh_question', 0, 'Why a handshake?', 'To agree on sequence numbers.', $3)`,
    [variantId, knowledgeBitId, superseded ? new Date() : null],
  );

  return variantId;
}

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

  it("should mark a card as new until its bit is first graded, then as in review", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    expect((await listKnowledgeBitReviewCards(10, { knowledgeBitId }))[0]?.phase).toBe("new");

    await recordKnowledgeBitReview({ variantId, grade: "good" });

    expect((await listKnowledgeBitReviewCards(10, { knowledgeBitId }))[0]?.phase).toBe("review");
  });

  it("should serve the least-reviewed card first across the whole deck", async () => {
    const reviewedBit = await seedBit();
    const reviewedVariant = await seedVariant(reviewedBit);
    const freshBit = await seedBit();
    const freshVariant = await seedVariant(freshBit);

    await recordKnowledgeBitReview({ variantId: reviewedVariant, grade: "good" });

    const ids = (await listKnowledgeBitReviewCards(50, undefined)).map((card) => card.variantId);

    expect(ids.indexOf(freshVariant)).toBeLessThan(ids.indexOf(reviewedVariant));
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
});
