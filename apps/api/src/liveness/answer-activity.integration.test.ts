import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIVENESS_STARTING_SCORE, QUESTIONS_PER_TOPIC, SLICE_TOPIC_COUNT } from "@post-anki/core";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `answer_activity_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { recordAnswerActivity, recordAnswerActivityForTopic } = await import(
  "./answer-activity.js"
);
const { getLivenessRecord, startLivenessTracking, readLivenessStatus, recordNudgeResponse } =
  await import("./liveness.repo.js");
const { releaseNextSlice } = await import("../learning-list/slice-release.js");

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

function daysAgo(days: number, from = Date.now()): string {
  return new Date(from - days * 24 * 60 * 60 * 1000).toISOString();
}

interface Fixture {
  curriculumId: string;
  topicIds: string[];
}

async function insertCurriculumWithTopics(topicCount: number): Promise<Fixture> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;
  const moduleId = `mod_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Captured series"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Module 1"],
  );

  const topicIds: string[] = [];

  for (let index = 0; index < topicCount; index += 1) {
    const topicId = `top_${randomUUID()}`;

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [topicId, moduleId, curriculumId, `Topic ${index + 1}`, index + 1],
    );
    topicIds.push(topicId);
  }

  return { curriculumId, topicIds };
}

async function insertLearningListItem(params: {
  curriculumId: string | null;
  questionCeiling: number | null;
  questionsGenerated?: number;
}): Promise<string> {
  const itemId = `llitem_${randomUUID()}`;

  await client.query(
    `INSERT INTO learning_list_items (id, kind, status, curriculum_id, question_ceiling, questions_generated)
     VALUES ($1, 'article', 'course_created', $2, $3, $4)`,
    [itemId, params.curriculumId, params.questionCeiling, params.questionsGenerated ?? 0],
  );

  return itemId;
}

async function includedTopicCount(curriculumId: string): Promise<number> {
  const rows = await client.query(
    `SELECT count(*)::int AS count FROM topics WHERE curriculum_id = $1 AND included = true`,
    [curriculumId],
  );

  return rows.rows[0].count as number;
}

async function questionsGenerated(itemId: string): Promise<number> {
  const rows = await client.query(
    `SELECT questions_generated FROM learning_list_items WHERE id = $1`,
    [itemId],
  );

  return rows.rows[0].questions_generated as number;
}

describe("SCENARIO 7 — answering keeps the item alive and releases the next slice", () => {
  it("refreshes liveness for the curriculum and the learning-list item the topic traces back to", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(6);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await Promise.all([
      startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(9)),
      startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }, daysAgo(9)),
    ]);

    const answeredAt = new Date().toISOString();

    await recordAnswerActivityForTopic(topicIds[0]!, answeredAt);

    const [curriculumRecord, itemRecord] = await Promise.all([
      getLivenessRecord({ entityType: "curriculum", entityId: curriculumId }),
      getLivenessRecord({ entityType: "learning_list_item", entityId: itemId }),
    ]);

    expect(curriculumRecord!.lastActivityAt).toBe(answeredAt);
    expect(itemRecord!.lastActivityAt).toBe(answeredAt);
  });

  it("releases one slice of topics for study and advances the ingestion cursor", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    await recordAnswerActivityForTopic(topicIds[0]!, new Date().toISOString());

    expect(await includedTopicCount(curriculumId)).toBe(SLICE_TOPIC_COUNT);
    expect(await questionsGenerated(itemId)).toBe(SLICE_TOPIC_COUNT * QUESTIONS_PER_TOPIC);
  });

  it("keeps releasing the next slice on separate days while liveness holds, never re-releasing the same topics", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const firstAt = new Date().toISOString();

    await releaseNextSlice(itemId, firstAt);
    await releaseNextSlice(itemId, daysAgo(-1, new Date(firstAt).getTime()));

    expect(await includedTopicCount(curriculumId)).toBe(SLICE_TOPIC_COUNT * 2);
    expect(await questionsGenerated(itemId)).toBe(SLICE_TOPIC_COUNT * QUESTIONS_PER_TOPIC * 2);
  });

  it("paces release to at most one slice per day, even when answers keep coming in the same sitting", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const now = new Date().toISOString();

    const first = await releaseNextSlice(itemId, now);
    const second = await releaseNextSlice(
      itemId,
      new Date(new Date(now).getTime() + 5 * 60 * 1000).toISOString(),
    );
    const third = await releaseNextSlice(
      itemId,
      new Date(new Date(now).getTime() + 23 * 60 * 60 * 1000).toISOString(),
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(SLICE_TOPIC_COUNT);
    expect(await questionsGenerated(itemId)).toBe(SLICE_TOPIC_COUNT * QUESTIONS_PER_TOPIC);
  });

  it("stops at the ceiling even when liveness sits at its maximum", async () => {
    const ceiling = 6;
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: ceiling });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const status = await readLivenessStatus({
      entityType: "learning_list_item",
      entityId: itemId,
    });

    const first = await releaseNextSlice(itemId);
    const second = await releaseNextSlice(itemId);

    expect(status.score).toBe(LIVENESS_STARTING_SCORE);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await questionsGenerated(itemId)).toBe(ceiling);
    expect(await includedTopicCount(curriculumId)).toBe(SLICE_TOPIC_COUNT);
  });

  it("releases nothing once silence has decayed the item below the generation threshold", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }, daysAgo(40));

    expect(await releaseNextSlice(itemId)).toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(0);
    expect(await questionsGenerated(itemId)).toBe(0);
  });

  it("releases nothing for an item a declined nudge made dormant", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });
    await recordNudgeResponse({ entityType: "learning_list_item", entityId: itemId }, "no");

    expect(await releaseNextSlice(itemId)).toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(0);
  });

  it("keeps generating for an item with no liveness history, because unset is not dead", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    expect(await releaseNextSlice(itemId)).not.toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(SLICE_TOPIC_COUNT);
  });

  it("never generates for an item whose ceiling has not been planned yet", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: null });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    expect(await releaseNextSlice(itemId)).toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(0);
  });
});

describe("SCENARIO 1 — a folded-in single article is never scored", () => {
  it("records no liveness row for content whose entities are untracked", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(3);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 6 });

    await recordAnswerActivityForTopic(topicIds[0]!, new Date().toISOString());

    const [curriculumRecord, itemRecord] = await Promise.all([
      getLivenessRecord({ entityType: "curriculum", entityId: curriculumId }),
      getLivenessRecord({ entityType: "learning_list_item", entityId: itemId }),
    ]);

    expect(curriculumRecord).toBeNull();
    expect(itemRecord).toBeNull();
  });

  it("never releases anything for a folded-in item, which has no curriculum of its own", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(3);
    const foldedIn = await insertLearningListItem({ curriculumId: null, questionCeiling: 6 });

    await recordAnswerActivityForTopic(topicIds[0]!, new Date().toISOString());

    expect(await releaseNextSlice(foldedIn)).toBeNull();
    expect(await questionsGenerated(foldedIn)).toBe(0);
    expect(
      await getLivenessRecord({ entityType: "learning_list_item", entityId: foldedIn }),
    ).toBeNull();
    expect(await includedTopicCount(curriculumId)).toBe(0);
  });
});

describe("SCENARIO 15 — concurrent answer submissions", () => {
  it("keeps the latest activity timestamp when several answers land at once", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await Promise.all([
      startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(20)),
      startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }, daysAgo(20)),
    ]);

    const base = Date.now();
    const latest = daysAgo(1, base);

    await Promise.all(
      [daysAgo(9, base), latest, daysAgo(5, base), daysAgo(3, base)].map((at) =>
        recordAnswerActivityForTopic(topicIds[0]!, at),
      ),
    );

    const [curriculumRecord, itemRecord] = await Promise.all([
      getLivenessRecord({ entityType: "curriculum", entityId: curriculumId }),
      getLivenessRecord({ entityType: "learning_list_item", entityId: itemId }),
    ]);

    expect(curriculumRecord!.lastActivityAt).toBe(latest);
    expect(itemRecord!.lastActivityAt).toBe(latest);
  });

  it("never double-counts the ingestion cursor when several answers race, and pacing lets only one through", async () => {
    const { curriculumId } = await insertCurriculumWithTopics(9);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const released = await Promise.all([
      releaseNextSlice(itemId),
      releaseNextSlice(itemId),
      releaseNextSlice(itemId),
    ]);
    const totalQuestions = released.reduce(
      (sum, slice) => sum + (slice?.questionsGenerated ?? 0),
      0,
    );
    const successes = released.filter((slice) => slice !== null);

    expect(successes).toHaveLength(1);
    expect(totalQuestions).toBe(SLICE_TOPIC_COUNT * QUESTIONS_PER_TOPIC);
    expect(totalQuestions).toBe(await questionsGenerated(itemId));
    expect(await includedTopicCount(curriculumId)).toBe(
      totalQuestions / QUESTIONS_PER_TOPIC,
    );
  });
});

describe("recordAnswerActivity — topics with no learning-list provenance", () => {
  it("refreshes the curriculum alone when no captured item links to it", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(3);

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(9));

    const answeredAt = new Date().toISOString();

    await recordAnswerActivityForTopic(topicIds[0]!, answeredAt);

    const record = await getLivenessRecord({
      entityType: "curriculum",
      entityId: curriculumId,
    });

    expect(record!.lastActivityAt).toBe(answeredAt);
  });

  it("ignores an answer on a topic that no longer exists", async () => {
    await expect(
      recordAnswerActivity(null, new Date().toISOString()),
    ).resolves.toBeUndefined();
    await expect(
      recordAnswerActivityForTopic(`top_${randomUUID()}`, new Date().toISOString()),
    ).resolves.toBeUndefined();
  });
});
