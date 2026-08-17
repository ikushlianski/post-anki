import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 8 (.planning/generalize-gap-tracking/scenarios.md) — the one
// real-DB concurrency race proof for the generalized gap-mastery write path
// (issue #57), mirroring apps/api/src/practice/phrase-bank-concurrency.integration.test.ts
// exactly in harness shape: real Postgres via DATABASE_URL/E2E_DATABASE_URL,
// assertLocalDbTarget guard, only the Mastra agent call mocked
// (vi.mock("../mastra/mastra.js", ...)) — defensive, since this specific
// race never crosses the replenish floor and so never actually calls the
// agent, but the harness shape is locked to match the precedent exactly.
//
// Non-negotiable per spec.md's Definition of Done: the test asserts BOTH
// concurrent calls resolve successfully (Promise.all, never
// Promise.allSettled, no swallowed rejection) as its own explicit assertion
// BEFORE any row is inspected — a test that tolerated one call silently
// failing (e.g. a unique-constraint violation from a duplicate gap_mastery
// insert racing an unlocked write path) would pass vacuously even with no
// lock at all.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `probe_gap_conc_${randomUUID().replace(/-/g, "_")}`;
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

interface Scenery {
  topicId: string;
  gapId: string;
  sessionId: string;
  questionAId: string;
  questionBId: string;
}

async function seedScenery(): Promise<Scenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");
  const sessionId = id("psess");
  const questionAId = id("psq");
  const questionBId = id("psq");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Concurrency test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Concurrency test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Concurrency test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Concurrency test topic"],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, "Idempotent retries"],
  );
  await client.query(
    // total: 20 — deliberately well above REPLENISH_FLOOR (10) so answering
    // 2 questions never crosses the replenish threshold and never triggers
    // the fire-and-forget maybeReplenish/agent call (advisor's warning) —
    // the race under test is the gap_mastery write path alone.
    `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, status, total, correct, answered)
     VALUES ($1, 'topic', $2, $3, 'active', 20, 0, 0)`,
    [sessionId, topicId, curriculumId],
  );

  for (const questionId of [questionAId, questionBId]) {
    await client.query(
      `INSERT INTO probe_session_questions
         (id, session_id, "order", topic_id, gap_id, prompt, options, correct_answer_index, type)
       VALUES ($1, $2, 1, $3, $4, 'Which is correct?', $5::jsonb, 0, 'single')`,
      [questionId, sessionId, topicId, gapId, JSON.stringify(["Right", "Wrong"])],
    );
  }

  return { topicId, gapId, sessionId, questionAId, questionBId };
}

describe("SCENARIO 8 — two concurrent quiz answers against the same topic/gap don't corrupt gap-mastery state", () => {
  it("both concurrent answerProbeSession calls resolve, no lost update, no duplicate gap_mastery row, no deadlock", async () => {
    const scenery = await seedScenery();
    const now = new Date().toISOString();

    const [resultA, resultB] = await Promise.all([
      answerProbeSession(
        { sessionId: scenery.sessionId, questionId: scenery.questionAId, selectedIndex: 0 },
        now,
      ),
      answerProbeSession(
        { sessionId: scenery.sessionId, questionId: scenery.questionBId, selectedIndex: 0 },
        now,
      ),
    ]);

    // Both calls must resolve to a real result object, not an error shape —
    // asserted BEFORE any row is inspected, per the Definition of Done.
    expect(resultA).not.toHaveProperty("error");
    expect(resultB).not.toHaveProperty("error");

    const { rows: masteryRows } = await client.query(
      `SELECT * FROM gap_mastery WHERE gap_id = $1`,
      [scenery.gapId],
    );

    // Exactly one gap_mastery row — the DB-level unique index backstop
    // holds, and no concurrent "no row yet" read raced past the advisory
    // lock into a duplicate insert (which would have surfaced as a
    // unique-constraint violation, failing the Promise.all assertion above
    // instead of silently landing here).
    expect(masteryRows).toHaveLength(1);

    const masteryRow = masteryRows[0]!;

    // Both concurrent corrects landed in the SAME probe_sessions row, so
    // the second serialized write must see itself as an adjacent
    // (same-session) repeat and NOT double-advance masteryStage — this is
    // the same-session non-advancement rule (spec.md Decision 4), proven
    // here under genuine concurrent execution rather than only sequential
    // unit tests. A lost update (the second write clobbering the first's
    // committed state instead of building on it) would instead show
    // masteryStage still at 0 or correctCountInCycle at 1 with
    // lastCorrectSessionId unset.
    expect(masteryRow.status).toBe("practicing");
    expect(masteryRow.mastery_stage).toBe(1);
    expect(masteryRow.correct_count_in_cycle).toBe(1);
    expect(masteryRow.last_correct_session_id).toBe(scenery.sessionId);

    const { rows: topicRows } = await client.query(
      `SELECT gap_mastery_sequence_number FROM topics WHERE id = $1`,
      [scenery.topicId],
    );

    // Incremented by exactly 2 — no lost increment across the two
    // concurrent transactions.
    expect(Number(topicRows[0]!.gap_mastery_sequence_number)).toBe(2);

    const { rows: gapRows } = await client.query(`SELECT state FROM gaps WHERE id = $1`, [
      scenery.gapId,
    ]);

    // masteryStage 1 of 3 — nowhere near the mastery threshold, so the
    // bridge write to gaps.state must never have fired.
    expect(gapRows[0]!.state).toBe("open");
  }, 30_000);
});
