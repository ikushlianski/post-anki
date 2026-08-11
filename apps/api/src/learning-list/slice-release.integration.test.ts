import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { learningListSlice: "learningListSlice" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

const dbName = `slice_release_${randomUUID().replace(/-/g, "_")}`;
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

const { releaseNextSlice } = await import("./slice-release.js");
const { startLivenessTracking } = await import("../liveness/liveness.repo.js");
const { setTopicReleaseState } = await import("../topic/topic-progress.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterEach(() => {
  mockAgentGenerate.mockReset();
});

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

async function insertCurriculumWithSource(): Promise<{ curriculumId: string; subjectId: string }> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'curating')`,
    [curriculumId, subjectId, "Captured series"],
  );
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, fetched_text)
     VALUES ($1, $2, 'text', 'https://example.com/a', 'A guide', 'Some real grounding text about the topic.')`,
    [`src_${randomUUID()}`, curriculumId],
  );

  return { curriculumId, subjectId };
}

async function insertLearningListItem(params: {
  curriculumId: string;
  questionCeiling: number;
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

async function moduleCount(curriculumId: string): Promise<number> {
  const rows = await client.query(`SELECT count(*)::int AS count FROM modules WHERE curriculum_id = $1`, [
    curriculumId,
  ]);

  return rows.rows[0].count as number;
}

async function includedTopics(curriculumId: string): Promise<{ id: string; releaseState: string | null }[]> {
  const rows = await client.query(
    `SELECT id, release_state AS "releaseState" FROM topics WHERE curriculum_id = $1 AND included = true`,
    [curriculumId],
  );

  return rows.rows;
}

async function gapCount(curriculumId: string): Promise<number> {
  const rows = await client.query(
    `SELECT count(*)::int AS count FROM gaps g JOIN topics t ON t.id = g.topic_id WHERE t.curriculum_id = $1`,
    [curriculumId],
  );

  return rows.rows[0].count as number;
}

async function questionsGenerated(itemId: string): Promise<number> {
  const rows = await client.query(`SELECT questions_generated FROM learning_list_items WHERE id = $1`, [
    itemId,
  ]);

  return rows.rows[0].questions_generated as number;
}

describe("0.9 — real generation when nothing is pre-drafted", () => {
  it("calls the slice-generation agent and writes real modules, topics and gaps grounded in the source text", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    mockAgentGenerate.mockResolvedValueOnce({
      object: {
        topics: [
          { title: "Topic A", summary: "About A", gaps: [{ label: "Gap A1", depth: "working" }] },
          { title: "Topic B", summary: null, gaps: [{ label: "Gap B1", depth: "working" }] },
        ],
      },
    });

    const released = await releaseNextSlice(itemId);

    expect(released).not.toBeNull();
    expect(released?.topicIds).toHaveLength(2);
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(await moduleCount(curriculumId)).toBe(1);
    expect(await gapCount(curriculumId)).toBe(2);
    expect(await questionsGenerated(itemId)).toBe(2);
  });

  it("advances the ingestion cursor by what the model actually produced, never by the slice's intended size", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Only one topic", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    const released = await releaseNextSlice(itemId);

    expect(released?.questionsGenerated).toBe(1);
    expect(await questionsGenerated(itemId)).toBe(1);
  });

  it("truncates the model's output so total gaps never exceed the ceiling", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 2 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    mockAgentGenerate.mockResolvedValueOnce({
      object: {
        topics: [
          {
            title: "Overgenerated topic",
            summary: null,
            gaps: [
              { label: "g1", depth: "working" },
              { label: "g2", depth: "working" },
              { label: "g3", depth: "working" },
              { label: "g4", depth: "working" },
            ],
          },
        ],
      },
    });

    const released = await releaseNextSlice(itemId);

    expect(released?.questionsGenerated).toBe(2);
    expect(await gapCount(curriculumId)).toBe(2);
    expect(await questionsGenerated(itemId)).toBe(2);
  });

  it("writes nothing when the agent throws, and never advances the cursor", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    mockAgentGenerate.mockRejectedValueOnce(new Error("model unreachable"));

    const released = await releaseNextSlice(itemId);

    expect(released).toBeNull();
    expect(await moduleCount(curriculumId)).toBe(0);
    expect(await questionsGenerated(itemId)).toBe(0);
  });

  it("writes nothing when the model returns no structured object", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    mockAgentGenerate.mockResolvedValueOnce({ object: undefined });

    expect(await releaseNextSlice(itemId)).toBeNull();
    expect(await moduleCount(curriculumId)).toBe(0);
  });

  it("never creates any domain_nodes row — the agent's structured output has no field capable of it", async () => {
    const { curriculumId } = await insertCurriculumWithSource();
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const before = await client.query(`SELECT count(*)::int AS count FROM domain_nodes`);

    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Topic A", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    await releaseNextSlice(itemId);

    const after = await client.query(`SELECT count(*)::int AS count FROM domain_nodes`);

    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});

describe("0.2 completion — releaseState is honoured by the release predicate", () => {
  async function insertCurriculumWithTopics(topicCount: number): Promise<{
    curriculumId: string;
    topicIds: string[];
  }> {
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

  it("never resurrects a topic the learner explicitly declined", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(3);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await setTopicReleaseState(topicIds[0]!, "declined");
    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const released = await releaseNextSlice(itemId);

    expect(released?.topicIds).not.toContain(topicIds[0]);
    const included = await includedTopics(curriculumId);

    expect(included.map((row) => row.id)).not.toContain(topicIds[0]);
  });

  it("still releases a NULL releaseState topic, which means 'not yet declined'", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(1);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const released = await releaseNextSlice(itemId);

    expect(released?.topicIds).toEqual(topicIds);
  });

  it("still releases a 'queued' releaseState topic", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(1);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await setTopicReleaseState(topicIds[0]!, "queued");
    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    const released = await releaseNextSlice(itemId);

    expect(released?.topicIds).toEqual(topicIds);
  });

  it("falls back to real generation once every remaining pre-drafted topic is declined", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(1);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await setTopicReleaseState(topicIds[0]!, "declined");
    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    await client.query(
      `INSERT INTO sources (id, curriculum_id, kind, value, title, fetched_text)
       VALUES ($1, $2, 'text', 'https://example.com/a', 'A guide', 'Real grounding text.')`,
      [`src_${randomUUID()}`, curriculumId],
    );

    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Freshly generated", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    const released = await releaseNextSlice(itemId);

    expect(released).not.toBeNull();
    expect(released?.topicIds[0]).not.toBe(topicIds[0]);
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });
});
