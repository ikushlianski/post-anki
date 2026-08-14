import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Issue #96, AC 20 / SCENARIO 2 & 3 — the paired real-Postgres proof for the
// early-mastery replenish gate, mirroring gap-mastery-concurrency.integration.test.ts's
// harness exactly (real Postgres via DATABASE_URL/E2E_DATABASE_URL,
// assertLocalDbTarget guard, only the Mastra agent call mocked). Unlike that
// file, this one deliberately DOES cross the replenish floor, so both
// branches of the new gate actually run against real generated batch code
// (probe-session.generate.ts's generateReplenishBatch/runGeneration), not
// just the pure predicate in isolation.
//
// Both twins seed identical scenery (same topic shape, same floor-crossing
// question count) differing ONLY in prior answered/correct counts, and both
// assertions live in this one file — the negative ("agent not called") case
// has a working positive control right next to it, proving the harness
// would have caught a missing gate rather than passing vacuously because the
// seeded scenario never actually crossed the floor (the exact hazard
// gap-mastery-concurrency.integration.test.ts:17-24 calls out for itself).

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

const dbName = `probe_replenish_gate_${randomUUID().replace(/-/g, "_")}`;
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

const mockGenerateAgent = vi.fn();
const mockGradeAgent = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: {
    probeQuizBatch: "probeQuizBatch",
    phraseBatchGenerate: "phraseBatchGenerate",
    gradeBatch: "gradeBatch",
  },
  getMastra: () => ({
    getAgent: (key: string) => ({
      generate: key === "probeQuizBatch" ? mockGenerateAgent : mockGradeAgent,
    }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { answerProbeSession } = await import("./probe-session.service.js");

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

const PASTED_GROUNDING_TEXT =
  "Idempotent retry design notes. ".repeat(10);

interface Scenery {
  topicId: string;
  sessionId: string;
  floorCrossingQuestionId: string;
}

// Seeds a topic-scope session with `total` = 15 question rows: `preAnsweredCorrect`
// of the first 5 already answered correctly (the rest of those 5 answered
// incorrectly), and 10 still unanswered, one of which (`floorCrossingQuestionId`)
// the test answers to cross REPLENISH_FLOOR (15 - 6 = 9 <= 10) and trigger
// `maybeReplenish`'s evaluation.
async function seedScenery(preAnsweredCorrect: number): Promise<Scenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const sessionId = id("psess");
  const sourceId = id("src");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Replenish gate test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Replenish gate test curriculum"],
  );
  // Pasted grounding text (>= 200 chars) so gatherProbeGrounding takes the
  // "pasted" branch (probe-grounding.ts:47-58) and never attempts a real
  // outbound web-search call during generateReplenishBatch.
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, approval_status)
     VALUES ($1, $2, 'text', $3, 'Pasted material', 'approved')`,
    [sourceId, curriculumId, PASTED_GROUNDING_TEXT],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Replenish gate test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Replenish gate test topic"],
  );
  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, status, total, correct, answered)
     VALUES ($1, 'topic', $2, $3, 'active', 15, $4, 5)`,
    [sessionId, topicId, curriculumId, preAnsweredCorrect],
  );

  let floorCrossingQuestionId = "";

  for (let i = 0; i < 15; i++) {
    const questionId = id("psq");
    const isPreAnswered = i < 5;

    if (isPreAnswered) {
      const isCorrect = i < preAnsweredCorrect;

      await client.query(
        `INSERT INTO probe_session_questions
           (id, session_id, "order", topic_id, prompt, options, correct_answer_index, type,
            answered_index, outcome, answered_at)
         VALUES ($1, $2, $3, $4, 'Which is correct?', $5::jsonb, 0, 'single', $6, $7, now())`,
        [
          questionId,
          sessionId,
          i + 1,
          topicId,
          JSON.stringify(["Right", "Wrong"]),
          isCorrect ? 0 : 1,
          isCorrect ? "pass" : "fail",
        ],
      );
    } else {
      await client.query(
        `INSERT INTO probe_session_questions
           (id, session_id, "order", topic_id, prompt, options, correct_answer_index, type)
         VALUES ($1, $2, $3, $4, 'Which is correct?', $5::jsonb, 0, 'single')`,
        [questionId, sessionId, i + 1, topicId, JSON.stringify(["Right", "Wrong"])],
      );

      if (i === 5) {
        floorCrossingQuestionId = questionId;
      }
    }
  }

  return { topicId, sessionId, floorCrossingQuestionId };
}

async function waitUntilAgentCalled(): Promise<void> {
  await vi.waitFor(
    () => {
      expect(mockGenerateAgent).toHaveBeenCalledTimes(1);
    },
    { timeout: 5_000, interval: 25 },
  );
}

describe("AC 20 / SCENARIO 2 & 3 — the early-mastery replenish gate against real Postgres", () => {
  beforeEach(() => {
    mockGenerateAgent.mockReset();
  });

  it("SCENARIO 2: a high-accuracy session (5 correct of 6) never calls the generation agent once it crosses the floor", async () => {
    const scenery = await seedScenery(4);
    const now = new Date().toISOString();

    const result = await answerProbeSession(
      {
        sessionId: scenery.sessionId,
        questionId: scenery.floorCrossingQuestionId,
        selectedIndex: 0,
      },
      now,
    );

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.correct).toBe(5);
    expect(result.answered).toBe(6);

    // No positive event to poll for on the negative path: the mastery gate
    // returns before any async I/O (tryClaimReplenish is never even
    // called), so `replenishing` never flips true in the first place. A
    // short grace period is enough for the fire-and-forget maybeReplenish
    // call to run its fully-synchronous early-return branch to completion.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockGenerateAgent).not.toHaveBeenCalled();

    const { rows } = await client.query(
      `SELECT replenishing FROM probe_sessions WHERE id = $1`,
      [scenery.sessionId],
    );

    expect(rows[0]?.replenishing).toBe(false);
  }, 30_000);

  it("SCENARIO 3 (positive control): a low-accuracy session (3 correct of 6) still calls the generation agent once it crosses the same floor", async () => {
    mockGenerateAgent.mockResolvedValue({
      object: {
        questions: [
          {
            prompt: "A fresh replenish question",
            options: ["Right", "Wrong"],
            correctAnswerIndex: 0,
            correctAnswerIndexes: null,
            type: "single",
            difficulty: "medium",
            format: "mcq",
            gapLabel: null,
            topicTitle: "Replenish gate test topic",
            optionExplanations: null,
          },
        ],
      },
    });

    const scenery = await seedScenery(2);
    const now = new Date().toISOString();

    const result = await answerProbeSession(
      {
        sessionId: scenery.sessionId,
        questionId: scenery.floorCrossingQuestionId,
        selectedIndex: 0,
      },
      now,
    );

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.correct).toBe(3);
    expect(result.answered).toBe(6);

    await waitUntilAgentCalled();
  }, 30_000);
});
