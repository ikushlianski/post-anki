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

const dbName = `list_next_variants_${randomUUID().replace(/-/g, "_")}`;
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

const { listNextQuestionVariantsToAnswer, insertQuestionVariant } = await import(
  "./knowledge-bit-question-variant.repo.js"
);
const { insertVariantAttempt } = await import("./knowledge-bit-variant-attempt.repo.js");
const { resolveOrCreateTag, assignTag } = await import("../tag/tag.repo.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedKnowledgeBit(
  body: string,
  topicId?: string,
  background?: string,
): Promise<string> {
  const sourceId = id("ksrc");
  const bitId = id("kb");

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [sourceId, body],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, background) VALUES ($1, $2, 0, $3, $4, $5)`,
    [bitId, sourceId, body, topicId ?? null, background ?? null],
  );

  return bitId;
}

async function seedTopic(title: string, learningStatus?: string): Promise<string> {
  const subjectId = id("sub");
  const curriculumId = id("cur");
  const moduleId = id("mod");
  const topicId = id("top");

  await client.query(`INSERT INTO subjects (id, name, require_sources) VALUES ($1, $2, false)`, [
    subjectId,
    title,
  ]);
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    title,
  ]);
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    moduleId,
    curriculumId,
    title,
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", learning_status)
     VALUES ($1, $2, $3, $4, 1, $5)`,
    [topicId, moduleId, curriculumId, title, learningStatus ?? "not_started"],
  );

  return topicId;
}

async function seedVariant(bitId: string, prompt: string): Promise<string> {
  await insertQuestionVariant(bitId, "wh_question", 0, prompt, "some answer");

  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
    [bitId],
  );

  return rows[0]!.id as string;
}

async function recordAttempt(variantId: string) {
  await insertVariantAttempt({
    variantId,
    userAnswer: "an answer",
    score: 9,
    verdict: "Ok",
    feedback: "feedback",
  });
}

async function seedSchedule(knowledgeBitId: string, dueAt: Date): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at) VALUES ($1, $2)`,
    [knowledgeBitId, dueAt.toISOString()],
  );
}

describe("listNextQuestionVariantsToAnswer (real Postgres)", () => {
  it("returns a never-attempted variant before an already-attempted one", async () => {
    const attemptedBit = await seedKnowledgeBit("Queue-order bit, attempted");
    const freshBit = await seedKnowledgeBit("Queue-order bit, fresh");
    const attemptedVariant = await seedVariant(attemptedBit, "Already answered?");
    const freshVariant = await seedVariant(freshBit, "Never answered?");

    await recordAttempt(attemptedVariant);

    const rows = await listNextQuestionVariantsToAnswer(2, undefined);
    const orderedIds = rows.map((row) => row.variantId);
    const freshIndex = orderedIds.indexOf(freshVariant);
    const attemptedIndex = orderedIds.indexOf(attemptedVariant);

    expect(freshIndex).toBeGreaterThanOrEqual(0);
    expect(attemptedIndex).toBeGreaterThanOrEqual(0);
    expect(freshIndex).toBeLessThan(attemptedIndex);
  });

  it("scopes to only variants whose bit carries the given tagId", async () => {
    const tag = await resolveOrCreateTag(`queue-tag-${randomUUID()}`);
    const taggedBit = await seedKnowledgeBit("Tagged bit for queue");
    const untaggedBit = await seedKnowledgeBit("Untagged bit for queue");
    const taggedVariant = await seedVariant(taggedBit, "Tagged question?");
    await seedVariant(untaggedBit, "Untagged question?");

    await assignTag(tag.id, "knowledgeBit", taggedBit);

    const rows = await listNextQuestionVariantsToAnswer(10, { tagId: tag.id });

    expect(rows.map((row) => row.variantId)).toEqual([taggedVariant]);
  });

  it("returns an empty array, not an error, when a tag has no assigned bits", async () => {
    const emptyTag = await resolveOrCreateTag(`empty-queue-tag-${randomUUID()}`);

    const rows = await listNextQuestionVariantsToAnswer(10, { tagId: emptyTag.id });

    expect(rows).toEqual([]);
  });

  it("scopes to only variants whose bit belongs to the given topicId", async () => {
    const topicId = await seedTopic("Queue topic scope");
    const otherTopicId = await seedTopic("Queue topic scope, other");
    const inTopicBit = await seedKnowledgeBit("In-topic bit for queue", topicId);
    const otherTopicBit = await seedKnowledgeBit("Other-topic bit for queue", otherTopicId);
    const inTopicVariant = await seedVariant(inTopicBit, "In-topic question?");
    await seedVariant(otherTopicBit, "Other-topic question?");

    const rows = await listNextQuestionVariantsToAnswer(10, { topicId });

    expect(rows.map((row) => row.variantId)).toEqual([inTopicVariant]);
  });

  it("returns nothing for a topic the learner deliberately dropped", async () => {
    const droppedTopicId = await seedTopic("Queue topic dropped", "skipping");
    const droppedBit = await seedKnowledgeBit("Dropped-topic bit for queue", droppedTopicId);
    await seedVariant(droppedBit, "Dropped-topic question?");

    const rows = await listNextQuestionVariantsToAnswer(10, { topicId: droppedTopicId });

    expect(rows).toEqual([]);
  });

  it("scopes to only variants whose bit matches the given knowledgeBitId", async () => {
    const targetBit = await seedKnowledgeBit("Target bit for queue");
    const otherBit = await seedKnowledgeBit("Other bit for queue");
    const targetVariant = await seedVariant(targetBit, "Target question?");
    await seedVariant(otherBit, "Other question?");

    const rows = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: targetBit });

    expect(rows.map((row) => row.variantId)).toEqual([targetVariant]);
  });

  it("returns the seeded bit's background text on its row", async () => {
    const backgroundText = `Background context ${randomUUID()}`;
    const bitId = await seedKnowledgeBit("Background bit for queue", undefined, backgroundText);
    const variantId = await seedVariant(bitId, "Background question?");

    const rows = await listNextQuestionVariantsToAnswer(10, undefined);
    const row = rows.find((row) => row.variantId === variantId);

    expect(row?.background).toBe(backgroundText);
  });

  it("returns null background for a bit seeded with no background text", async () => {
    const bitId = await seedKnowledgeBit("No-background bit for queue");
    const variantId = await seedVariant(bitId, "No-background question?");

    const rows = await listNextQuestionVariantsToAnswer(10, undefined);
    const row = rows.find((row) => row.variantId === variantId);

    expect(row?.background).toBeNull();
  });

  it("within a topic, serves an overdue bit before a not-yet-due bit even when the latter has fewer attempts", async () => {
    const topicId = await seedTopic("Queue topic due-first");
    const overdueBit = await seedKnowledgeBit("Overdue bit for queue", topicId);
    const notYetDueBit = await seedKnowledgeBit("Not-yet-due bit for queue", topicId);
    const overdueVariant = await seedVariant(overdueBit, "Overdue question?");
    const notYetDueVariant = await seedVariant(notYetDueBit, "Not-yet-due question?");

    await seedSchedule(overdueBit, new Date(Date.now() - 24 * 60 * 60 * 1000));
    await seedSchedule(notYetDueBit, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    await recordAttempt(overdueVariant);

    const rows = await listNextQuestionVariantsToAnswer(10, { topicId });
    const orderedIds = rows.map((row) => row.variantId);

    expect(orderedIds.indexOf(overdueVariant)).toBeLessThan(orderedIds.indexOf(notYetDueVariant));
  });
});
