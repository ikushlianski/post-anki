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
const { approveKnowledgeBit } = await import("./knowledge-bit-approval.repo.js");
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
  approvalState: "pending" | "approved" | "rejected" = "approved",
): Promise<string> {
  const sourceId = id("ksrc");
  const bitId = id("kb");

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [sourceId, body],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, background, approval_state) VALUES ($1, $2, 0, $3, $4, $5, $6)`,
    [bitId, sourceId, body, topicId ?? null, background ?? null, approvalState],
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

  it("excludes a tagged bit whose topic was deliberately dropped", async () => {
    const tag = await resolveOrCreateTag(`dropped-topic-tag-${randomUUID()}`);
    const droppedTopicId = await seedTopic("Tag queue topic dropped", "skipping");
    const droppedBit = await seedKnowledgeBit("Dropped-topic tagged bit for queue", droppedTopicId);
    await seedVariant(droppedBit, "Dropped-topic tagged question?");
    await assignTag(tag.id, "knowledgeBit", droppedBit);

    const rows = await listNextQuestionVariantsToAnswer(10, { tagId: tag.id });

    expect(rows).toEqual([]);
  });

  it("returns an empty array, not an error, when a tag has no assigned bits", async () => {
    const emptyTag = await resolveOrCreateTag(`empty-queue-tag-${randomUUID()}`);

    const rows = await listNextQuestionVariantsToAnswer(10, { tagId: emptyTag.id });

    expect(rows).toEqual([]);
  });

  it("excludes a dropped-topic bit from the default, unfiltered queue", async () => {
    const droppedTopicId = await seedTopic("Default queue topic dropped", "skipping");
    const droppedBit = await seedKnowledgeBit("Dropped-topic bit for default queue", droppedTopicId);
    const droppedVariant = await seedVariant(droppedBit, "Dropped-topic default question?");

    const rows = await listNextQuestionVariantsToAnswer(500, undefined);

    expect(rows.map((row) => row.variantId)).not.toContain(droppedVariant);
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

  it("excludes a superseded variant left behind by a body edit, even though it still has attempts", async () => {
    const bitId = await seedKnowledgeBit("Superseded-variant bit for queue");
    const staleVariant = await seedVariant(bitId, "Stale question?");
    await recordAttempt(staleVariant);
    await client.query(
      `UPDATE knowledge_bit_question_variants SET superseded_at = now() WHERE id = $1`,
      [staleVariant],
    );

    const rows = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: bitId });

    expect(rows).toEqual([]);
  });

  it("excludes a bit fetched directly by knowledgeBitId when its topic was dropped", async () => {
    const droppedTopicId = await seedTopic("Direct queue topic dropped", "skipping");
    const droppedBit = await seedKnowledgeBit("Dropped-topic bit for direct queue", droppedTopicId);
    await seedVariant(droppedBit, "Dropped-topic direct question?");

    const rows = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: droppedBit });

    expect(rows).toEqual([]);
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

  it("should never serve a basic card in typed mode, in any scope", async () => {
    const topicId = await seedTopic("Basic exclusion topic");
    const bitId = await seedKnowledgeBit("Bit with a basic card", topicId);

    await insertQuestionVariant(bitId, "basic", 0, "Front?", "Back");

    const unscoped = await listNextQuestionVariantsToAnswer(500, undefined);
    const byBit = await listNextQuestionVariantsToAnswer(500, { knowledgeBitId: bitId });
    const byTopic = await listNextQuestionVariantsToAnswer(500, { topicId });

    expect(unscoped.map((row) => row.knowledgeBitId)).not.toContain(bitId);
    expect(byBit).toEqual([]);
    expect(byTopic).toEqual([]);
  });

  it("should exclude a pending bit's variant from the default, unfiltered queue", async () => {
    const pendingBit = await seedKnowledgeBit("Pending bit for queue", undefined, undefined, "pending");
    const pendingVariant = await seedVariant(pendingBit, "Pending question?");

    const rows = await listNextQuestionVariantsToAnswer(500, undefined);

    expect(rows.map((row) => row.variantId)).not.toContain(pendingVariant);
  });

  it("should exclude a rejected bit's variant from the default, unfiltered queue", async () => {
    const rejectedBit = await seedKnowledgeBit("Rejected bit for queue", undefined, undefined, "rejected");
    const rejectedVariant = await seedVariant(rejectedBit, "Rejected question?");

    const rows = await listNextQuestionVariantsToAnswer(500, undefined);

    expect(rows.map((row) => row.variantId)).not.toContain(rejectedVariant);
  });

  it("should exclude a pending bit's variant even when fetched directly by knowledgeBitId", async () => {
    const pendingBit = await seedKnowledgeBit("Direct pending bit for queue", undefined, undefined, "pending");
    await seedVariant(pendingBit, "Direct pending question?");

    const rows = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: pendingBit });

    expect(rows).toEqual([]);
  });

  it("should include a previously pending bit's variant once it's approved", async () => {
    const bitId = await seedKnowledgeBit("Approve-then-visible bit for queue", undefined, undefined, "pending");
    const variantId = await seedVariant(bitId, "Approve-then-visible question?");

    const beforeApproval = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: bitId });
    expect(beforeApproval).toEqual([]);

    await approveKnowledgeBit(bitId);

    const afterApproval = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: bitId });
    expect(afterApproval.map((row) => row.variantId)).toEqual([variantId]);
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

  it("should leave a not-yet-due bit out of the unscoped queue but keep serving overdue and never-reviewed ones", async () => {
    const notYetDueBit = await seedKnowledgeBit("Unscoped not-yet-due bit");
    const overdueBit = await seedKnowledgeBit("Unscoped overdue bit");
    const freshBit = await seedKnowledgeBit("Unscoped never-reviewed bit");
    const notYetDueVariant = await seedVariant(notYetDueBit, "Not yet due?");
    const overdueVariant = await seedVariant(overdueBit, "Overdue?");
    const freshVariant = await seedVariant(freshBit, "Never reviewed?");

    await seedSchedule(notYetDueBit, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    await seedSchedule(overdueBit, new Date(Date.now() - 24 * 60 * 60 * 1000));

    const ids = (await listNextQuestionVariantsToAnswer(500, undefined)).map((row) => row.variantId);

    expect(ids).not.toContain(notYetDueVariant);
    expect(ids).toContain(overdueVariant);
    expect(ids).toContain(freshVariant);
  });

  it("should serve a not-yet-due bit when the queue is scoped to that bit", async () => {
    const bitId = await seedKnowledgeBit("Scoped not-yet-due bit");
    const variantId = await seedVariant(bitId, "Scoped not yet due?");

    await seedSchedule(bitId, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const rows = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: bitId });

    expect(rows.map((row) => row.variantId)).toEqual([variantId]);
  });

  it("should serve one variant per bit in the unscoped queue, the one with the fewest attempts", async () => {
    const bitId = await seedKnowledgeBit("Two-variant bit");
    const attempted = await seedVariant(bitId, "Attempted variant?");

    await insertQuestionVariant(bitId, "wh_question", 1, "Fresh variant?", "some answer");
    await recordAttempt(attempted);

    const rows = (await listNextQuestionVariantsToAnswer(500, undefined)).filter(
      (row) => row.knowledgeBitId === bitId,
    );

    expect(rows.map((row) => row.prompt)).toEqual(["Fresh variant?"]);
  });

  it("should never serve a suspended bit, and serve a buried bit only after the bury has ended", async () => {
    const suspendedBit = await seedKnowledgeBit("Typed suspended bit");
    const buriedBit = await seedKnowledgeBit("Typed buried bit");
    const expiredBit = await seedKnowledgeBit("Typed expired bury bit");
    const suspendedVariant = await seedVariant(suspendedBit, "Suspended?");
    const buriedVariant = await seedVariant(buriedBit, "Buried?");
    const expiredVariant = await seedVariant(expiredBit, "Expired bury?");
    const dayMs = 24 * 60 * 60 * 1000;

    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, suspended_at) VALUES ($1, $2, now())`,
      [suspendedBit, new Date(Date.now() - dayMs).toISOString()],
    );
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, buried_until) VALUES ($1, $2, $3)`,
      [buriedBit, new Date(Date.now() - dayMs).toISOString(), new Date(Date.now() + dayMs).toISOString()],
    );
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, buried_until) VALUES ($1, $2, $3)`,
      [expiredBit, new Date(Date.now() - dayMs).toISOString(), new Date(Date.now() - 1000).toISOString()],
    );

    const unscoped = (await listNextQuestionVariantsToAnswer(500, undefined)).map((row) => row.variantId);
    const scoped = await listNextQuestionVariantsToAnswer(10, { knowledgeBitId: suspendedBit });

    expect(unscoped).not.toContain(suspendedVariant);
    expect(unscoped).not.toContain(buriedVariant);
    expect(unscoped).toContain(expiredVariant);
    expect(scoped).toEqual([]);
  });
});
