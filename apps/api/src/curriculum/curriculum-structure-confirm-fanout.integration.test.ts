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

const dbName = `confirm_structure_fanout_${randomUUID().replace(/-/g, "_")}`;
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
  AGENT_KEYS: { cardsCompiler: "cardsCompiler" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(async () => []),
}));

const { confirmStructure } = await import("./curriculum-structure.js");
const { insertStructureTurn } = await import("./curriculum.repo.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedShapingCurriculum(): Promise<{
  curriculumId: string;
  includedTopicId: string;
  excludedTopicId: string;
}> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const includedTopicId = id("topic");
  const excludedTopicId = id("topic");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Confirm fanout subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'shaping_structure')`,
    [curriculumId, subjectId, "Confirm fanout curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Pre-existing module"],
  );

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
     VALUES ($1, $2, $3, $4, 1, true)`,
    [includedTopicId, moduleId, curriculumId, "Already-included topic"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
     VALUES ($1, $2, $3, $4, 2, false)`,
    [excludedTopicId, moduleId, curriculumId, "Not-yet-included topic"],
  );

  await insertStructureTurn(curriculumId, {
    role: "assistant",
    message: "Here's the draft.",
    structureSnapshot: {
      modules: [
        {
          title: "Newly confirmed module",
          level: "basic",
          tags: [],
          topics: [
            {
              title: "Newly confirmed topic",
              summary: null,
              suggestedDepth: "working",
              sourceUrl: null,
            },
          ],
        },
      ],
      strictOrder: false,
    },
    status: "complete",
  });

  return { curriculumId, includedTopicId, excludedTopicId };
}

describe("confirmStructure fan-out (real Postgres)", () => {
  it("triggers card generation only for topics already marked included", async () => {
    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    const { curriculumId, includedTopicId } = await seedShapingCurriculum();

    const result = await confirmStructure(curriculumId);

    expect(result).not.toBe("not_found");
    expect(result).not.toBe("not_shaping_structure");
    expect(result).not.toBe("no_snapshot");

    await vi.waitFor(() => {
      expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(
      async () => {
        const { rows: cardStatusRows } = await client.query<{ status: string }>(
          `SELECT status FROM topic_card_sets WHERE topic_id = $1`,
          [includedTopicId],
        );

        expect(cardStatusRows).toHaveLength(1);
        expect(cardStatusRows[0]!.status).toBe("ready");
      },
      { timeout: 10_000 },
    );

    const { rows: everyTopicCardRow } = await client.query<{ topic_id: string }>(
      `SELECT topic_id FROM topic_card_sets WHERE topic_id IN (
         SELECT id FROM topics WHERE curriculum_id = $1
       )`,
      [curriculumId],
    );

    expect(everyTopicCardRow.map((r) => r.topic_id)).toEqual([includedTopicId]);
  }, 20_000);
});
