import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const dbName = `slice_release_fanout_${randomUUID().replace(/-/g, "_")}`;
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

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { cardsCompiler: "cardsCompiler", learningListSlice: "learningListSlice" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(async () => []),
}));

// Real releases never exceed SLICE_TOPIC_COUNT (3); stubbed to exercise the cap against more.
vi.mock("@post-anki/core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    nextIngestionSlice: () => ({ topicCount: 6, questionCount: 12 }),
  };
});

const { releaseNextSliceSafely } = await import("./slice-release.js");
const { startLivenessTracking } = await import("../liveness/liveness.repo.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

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

async function insertLearningListItem(params: {
  curriculumId: string;
  questionCeiling: number;
}): Promise<string> {
  const itemId = `llitem_${randomUUID()}`;

  await client.query(
    `INSERT INTO learning_list_items (id, kind, status, curriculum_id, question_ceiling, questions_generated)
     VALUES ($1, 'article', 'course_created', $2, $3, 0)`,
    [itemId, params.curriculumId, params.questionCeiling],
  );

  return itemId;
}

async function cardSetStatus(topicId: string): Promise<string | undefined> {
  const { rows } = await client.query(
    `SELECT status FROM topic_card_sets WHERE topic_id = $1`,
    [topicId],
  );

  return rows[0]?.status as string | undefined;
}

describe("releaseNextSliceSafely's card-generation fan-out (real Postgres)", () => {
  it("never runs more than 3 topics' card generation at once, even when a release includes more", async () => {
    const { curriculumId, topicIds } = await insertCurriculumWithTopics(6);
    const itemId = await insertLearningListItem({ curriculumId, questionCeiling: 24 });

    await startLivenessTracking({ entityType: "learning_list_item", entityId: itemId });

    let inFlight = 0;
    let maxInFlight = 0;

    mockAgentGenerate.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      await new Promise((resolve) => setTimeout(resolve, 50));

      inFlight -= 1;

      return { object: { cards: [{ concept: "Concept A", variants: [] }] } };
    });

    const released = await releaseNextSliceSafely(itemId);

    expect(released?.topicIds).toHaveLength(6);
    expect(released?.topicIds).toEqual(topicIds);

    await vi.waitFor(
      async () => {
        for (const topicId of topicIds) {
          expect(await cardSetStatus(topicId)).toBe("ready");
        }
      },
      { timeout: 15_000 },
    );

    expect(mockAgentGenerate).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeGreaterThan(0);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  }, 20_000);
});
