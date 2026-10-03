import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// exam-prep-mock-exam-session — S1-S6's load-bearing regression tests,
// against real Postgres (same harness as probe-session-replenish.integration.test.ts):
// an exam never collides with an active practice session on the same scope
// (S1), never grows (S2, with a practice-mode positive control proving the
// harness would have caught a missing guard), never elects topic depth or
// unlocks calibration (S3), never feeds gap mastery/topic progress (S4, same
// practice-mode-control shape), its answers still count toward
// answered-question/analytics history (S5), and its targetCount is capped to
// the fixed [10, 20, 30] menu (S6).

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

const dbName = `probe_exam_mode_${randomUUID().replace(/-/g, "_")}`;
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

const { prepareProbeSession, answerProbeSession } = await import("./probe-session.service.js");
const { getActiveSessionRow, getCalibrationCompletionForCurriculum } = await import(
  "./probe-session.repo.js"
);
const { isSocraticGatedByCalibration } = await import("../probe/probe.service.js");
const { countQuestionsAnswered } = await import("../home/home.repo.js");
const { listAnsweredProbeSessionQuestionsForGaps } = await import(
  "../analytics/analytics.repo.js"
);

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

const PASTED_GROUNDING_TEXT = "Idempotent retry design notes. ".repeat(10);

interface CurriculumScenery {
  subjectId: string;
  curriculumId: string;
  moduleId: string;
  topicId: string;
}

async function seedConfirmedCurriculum(): Promise<CurriculumScenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const sourceId = id("src");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Exam mode test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Exam mode test curriculum"],
  );
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, approval_status)
     VALUES ($1, $2, 'text', $3, 'Pasted material', 'approved')`,
    [sourceId, curriculumId, PASTED_GROUNDING_TEXT],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Exam mode test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, priority)
     VALUES ($1, $2, $3, $4, 1, true, 1)`,
    [topicId, moduleId, curriculumId, "Exam mode test topic"],
  );

  return { subjectId, curriculumId, moduleId, topicId };
}

function stubQuestion(topicTitle: string, index: number) {
  return {
    prompt: `Stub exam question ${index}?`,
    options: ["Right", "Wrong"],
    correctAnswerIndex: 0,
    correctAnswerIndexes: null,
    type: "single",
    difficulty: "medium",
    format: "mcq",
    gapLabel: null,
    topicTitle,
    optionExplanations: null,
  };
}

describe("S1 — starting an exam never touches an in-progress practice session", () => {
  it("creates a brand-new exam session, leaving the active practice session on the same scope untouched", async () => {
    const { curriculumId, topicId } = await seedConfirmedCurriculum();
    const practiceSessionId = id("psess");

    await client.query(
      `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, mode, status, total, correct, answered)
       VALUES ($1, 'curriculum', $2, $2, 'practice', 'active', 5, 1, 1)`,
      [practiceSessionId, curriculumId],
    );

    mockGenerateAgent.mockResolvedValue({
      object: {
        questions: Array.from({ length: 10 }, (_, i) =>
          stubQuestion("Exam mode test topic", i),
        ),
      },
    });

    const now = new Date().toISOString();
    const result = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, mode: "exam", targetCount: 10 },
      now,
    );

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.mode).toBe("exam");
    expect(result.id).not.toBe(practiceSessionId);

    const stillActivePractice = await getActiveSessionRow("curriculum", curriculumId, "practice");

    expect(stillActivePractice?.id).toBe(practiceSessionId);
    expect(stillActivePractice?.total).toBe(5);

    void topicId;
  }, 30_000);
});

interface TopicScenery {
  topicId: string;
  sessionId: string;
  floorCrossingQuestionId: string;
}

// Mirrors probe-session-replenish.integration.test.ts's seedScenery shape —
// 15 total questions, 5 pre-answered (some correct, some not), 10
// unanswered, one of which crosses REPLENISH_FLOOR (15 - 6 = 9 <= 10).
async function seedReplenishScenery(
  mode: "practice" | "exam",
  preAnsweredCorrect: number,
): Promise<TopicScenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const sessionId = id("psess");
  const sourceId = id("src");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Exam mode replenish subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Exam mode replenish curriculum"],
  );
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, approval_status)
     VALUES ($1, $2, 'text', $3, 'Pasted material', 'approved')`,
    [sourceId, curriculumId, PASTED_GROUNDING_TEXT],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Exam mode replenish module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, "Exam mode replenish topic"],
  );
  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, mode, status, total, correct, answered)
     VALUES ($1, 'topic', $2, $3, $4, 'active', 15, $5, 5)`,
    [sessionId, topicId, curriculumId, mode, preAnsweredCorrect],
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

describe("S2 — an exam has exactly the requested number of questions, forever", () => {
  beforeEach(() => {
    mockGenerateAgent.mockReset();
  });

  it("an exam session never calls the replenish-generation agent, even at low accuracy past the floor", async () => {
    const scenery = await seedReplenishScenery("exam", 2);
    const now = new Date().toISOString();

    const result = await answerProbeSession(
      { sessionId: scenery.sessionId, questionId: scenery.floorCrossingQuestionId, selectedIndex: 0 },
      now,
    );

    expect(result).not.toHaveProperty("error");

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockGenerateAgent).not.toHaveBeenCalled();

    const { rows } = await client.query(
      `SELECT total FROM probe_sessions WHERE id = $1`,
      [scenery.sessionId],
    );

    expect(rows[0]?.total).toBe(15);
  }, 30_000);

  it("positive control: a practice session at the same low accuracy past the same floor DOES call the replenish-generation agent", async () => {
    mockGenerateAgent.mockResolvedValue({
      object: {
        questions: [stubQuestion("Exam mode replenish topic", 0)],
      },
    });

    const scenery = await seedReplenishScenery("practice", 2);
    const now = new Date().toISOString();

    const result = await answerProbeSession(
      { sessionId: scenery.sessionId, questionId: scenery.floorCrossingQuestionId, selectedIndex: 0 },
      now,
    );

    expect(result).not.toHaveProperty("error");

    await vi.waitFor(
      () => {
        expect(mockGenerateAgent).toHaveBeenCalledTimes(1);
      },
      { timeout: 5_000, interval: 25 },
    );
  }, 30_000);
});

describe("S3 — an exam on curriculum scope never elects topic depth or unlocks calibration", () => {
  it("completing a curriculum-scope exam leaves topics.depth/depthElectedAt untouched and the calibration gate still active", async () => {
    const { curriculumId, topicId } = await seedConfirmedCurriculum();
    const sessionId = id("psess");
    const questionId = id("psq");

    await client.query(
      `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, mode, status, total, correct, answered)
       VALUES ($1, 'curriculum', $2, $2, 'exam', 'active', 1, 0, 0)`,
      [sessionId, curriculumId],
    );
    await client.query(
      `INSERT INTO probe_session_questions
         (id, session_id, "order", topic_id, prompt, options, correct_answer_index, type)
       VALUES ($1, $2, 1, $3, 'Which is correct?', $4::jsonb, 0, 'single')`,
      [questionId, sessionId, topicId, JSON.stringify(["Right", "Wrong"])],
    );

    const now = new Date().toISOString();
    const result = await answerProbeSession(
      { sessionId, questionId, selectedIndex: 0 },
      now,
    );

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.status).toBe("completed");

    const { rows: topicRows } = await client.query(
      `SELECT depth, depth_elected_at FROM topics WHERE id = $1`,
      [topicId],
    );

    expect(topicRows[0]?.depth).toBe("working");
    expect(topicRows[0]?.depth_elected_at).toBeNull();

    const completion = await getCalibrationCompletionForCurriculum(curriculumId, "practice");

    expect(completion.calibrationCompletedAt).toBeNull();
    expect(await isSocraticGatedByCalibration(topicId)).toBe(true);
  }, 30_000);
});

describe("S4 — an exam answer never touches gap mastery or topic progress", () => {
  it("an exam answer on a question tagged with an open gap leaves gap_mastery and the topic's progress untouched; the same gap answered in a practice session does advance", async () => {
    const { topicId } = await seedConfirmedCurriculum();
    const gapId = id("gap");

    await client.query(
      `INSERT INTO gaps (id, topic_id, label, state) VALUES ($1, $2, 'Caching basics', 'open')`,
      [gapId, topicId],
    );

    const examSessionId = id("psess");
    const examQuestionId = id("psq");

    await client.query(
      `INSERT INTO probe_sessions (id, scope, scope_id, mode, status, total, correct, answered)
       VALUES ($1, 'topic', $2, 'exam', 'active', 1, 0, 0)`,
      [examSessionId, topicId],
    );
    await client.query(
      `INSERT INTO probe_session_questions
         (id, session_id, "order", topic_id, gap_id, prompt, options, correct_answer_index, type)
       VALUES ($1, $2, 1, $3, $4, 'Which is correct?', $5::jsonb, 0, 'single')`,
      [examQuestionId, examSessionId, topicId, gapId, JSON.stringify(["Right", "Wrong"])],
    );

    const now = new Date().toISOString();
    const examResult = await answerProbeSession(
      { sessionId: examSessionId, questionId: examQuestionId, selectedIndex: 0 },
      now,
    );

    expect(examResult).not.toHaveProperty("error");

    const { rows: masteryAfterExam } = await client.query(
      `SELECT * FROM gap_mastery WHERE gap_id = $1`,
      [gapId],
    );

    expect(masteryAfterExam).toHaveLength(0);

    const { rows: topicAfterExam } = await client.query(
      `SELECT progress_maturity, learning_status FROM topics WHERE id = $1`,
      [topicId],
    );

    expect(topicAfterExam[0]?.progress_maturity).toBe(0);
    expect(topicAfterExam[0]?.learning_status).toBe("not_started");

    // Practice control — same gap, same topic, a fresh session/question.
    const practiceSessionId = id("psess");
    const practiceQuestionId = id("psq");

    await client.query(
      `INSERT INTO probe_sessions (id, scope, scope_id, mode, status, total, correct, answered)
       VALUES ($1, 'topic', $2, 'practice', 'active', 1, 0, 0)`,
      [practiceSessionId, topicId],
    );
    await client.query(
      `INSERT INTO probe_session_questions
         (id, session_id, "order", topic_id, gap_id, prompt, options, correct_answer_index, type)
       VALUES ($1, $2, 1, $3, $4, 'Which is correct?', $5::jsonb, 0, 'single')`,
      [practiceQuestionId, practiceSessionId, topicId, gapId, JSON.stringify(["Right", "Wrong"])],
    );

    const practiceResult = await answerProbeSession(
      { sessionId: practiceSessionId, questionId: practiceQuestionId, selectedIndex: 0 },
      now,
    );

    expect(practiceResult).not.toHaveProperty("error");
    if ("error" in practiceResult) {
      throw new Error("unreachable");
    }

    expect(practiceResult.gapMastery).not.toBeNull();

    const { rows: masteryAfterPractice } = await client.query(
      `SELECT * FROM gap_mastery WHERE gap_id = $1`,
      [gapId],
    );

    expect(masteryAfterPractice.length).toBeGreaterThan(0);

    // S5 — both the exam's and the practice session's answered questions
    // count toward answered-question/analytics history (no mode filter on
    // either query).
    const answeredForGap = await listAnsweredProbeSessionQuestionsForGaps();
    const gapAnsweredIds = answeredForGap.filter((row) => row.gapId === gapId);

    expect(gapAnsweredIds.length).toBeGreaterThanOrEqual(2);

    const totalAnswered = await countQuestionsAnswered();

    expect(totalAnswered).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe("S6 — targetCount is capped to a fixed, safe menu", () => {
  beforeEach(() => {
    mockGenerateAgent.mockReset();
    mockGenerateAgent.mockResolvedValue({
      object: {
        questions: Array.from({ length: 30 }, (_, i) =>
          stubQuestion("Exam mode test topic", i),
        ),
      },
    });
  });

  it.each([10, 20, 30])(
    "mode: exam, targetCount: %i succeeds with exactly that many questions",
    async (targetCount) => {
      const { curriculumId } = await seedConfirmedCurriculum();
      const now = new Date().toISOString();

      const result = await prepareProbeSession(
        { scope: "curriculum", scopeId: curriculumId, mode: "exam", targetCount },
        now,
      );

      expect(result).not.toHaveProperty("error");
      if ("error" in result) {
        throw new Error("unreachable");
      }

      expect(result.total).toBe(targetCount);
      expect(result.questions).toHaveLength(targetCount);
    },
    30_000,
  );

  it("mode: exam, targetCount: 15 is rejected with no session created", async () => {
    const { curriculumId } = await seedConfirmedCurriculum();
    const now = new Date().toISOString();

    const result = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, mode: "exam", targetCount: 15 },
      now,
    );

    expect(result).toEqual({ error: "invalid_target_count" });
    expect(mockGenerateAgent).not.toHaveBeenCalled();

    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM probe_sessions WHERE scope_id = $1`,
      [curriculumId],
    );

    expect(rows[0]?.n).toBe(0);
  }, 30_000);

  it("mode: exam with no targetCount is rejected", async () => {
    const { curriculumId } = await seedConfirmedCurriculum();
    const now = new Date().toISOString();

    const result = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, mode: "exam" },
      now,
    );

    expect(result).toEqual({ error: "invalid_target_count" });
  }, 30_000);

  it("mode: practice, targetCount: 15 succeeds (ignored, no validation, scope's own total used)", async () => {
    const { curriculumId } = await seedConfirmedCurriculum();
    const now = new Date().toISOString();

    const result = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, targetCount: 15 },
      now,
    );

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      throw new Error("unreachable");
    }

    expect(result.mode).toBe("practice");
    // Curriculum-scope practice total is scope-derived (10-20, single
    // included topic => 10), never the ignored targetCount of 15.
    expect(result.total).not.toBe(15);
  }, 30_000);
});

describe("retaking an exam preserves its answered history instead of deleting it", () => {
  it("closes the old exam out as completed, keeping its answer in answered-question/analytics history, while a brand-new exam session is created", async () => {
    const { curriculumId } = await seedConfirmedCurriculum();

    mockGenerateAgent.mockResolvedValue({
      object: { questions: Array.from({ length: 10 }, (_, i) => stubQuestion("Exam mode test topic", i)) },
    });

    const started = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, mode: "exam", targetCount: 10 },
      new Date().toISOString(),
    );

    if ("error" in started) {
      throw new Error("unreachable");
    }

    const firstQuestionId = started.questions[0]!.id;
    const answerCountBefore = await countQuestionsAnswered();

    const answered = await answerProbeSession(
      { sessionId: started.id, questionId: firstQuestionId, selectedIndex: 0 },
      new Date().toISOString(),
    );

    if ("error" in answered) {
      throw new Error("unreachable");
    }

    mockGenerateAgent.mockResolvedValue({
      object: { questions: Array.from({ length: 10 }, (_, i) => stubQuestion("Exam mode test topic", i)) },
    });

    const retaken = await prepareProbeSession(
      { scope: "curriculum", scopeId: curriculumId, mode: "exam", targetCount: 10, regenerate: true },
      new Date().toISOString(),
    );

    if ("error" in retaken) {
      throw new Error("unreachable");
    }

    expect(retaken.id).not.toBe(started.id);

    const oldSessionRow = (
      await client.query(`SELECT status FROM probe_sessions WHERE id = $1`, [started.id])
    ).rows[0];

    expect(oldSessionRow.status).toBe("completed");

    const oldQuestionStillAnswered = (
      await client.query(
        `SELECT answered_at FROM probe_session_questions WHERE id = $1`,
        [firstQuestionId],
      )
    ).rows[0];

    expect(oldQuestionStillAnswered.answered_at).not.toBeNull();
    expect(await countQuestionsAnswered()).toBe(answerCountBefore + 1);

    const activeExam = await getActiveSessionRow("curriculum", curriculumId, "exam");

    expect(activeExam?.id).toBe(retaken.id);

    const secondQuestionId = started.questions[1]!.id;

    const lateAnswer = await answerProbeSession(
      { sessionId: started.id, questionId: secondQuestionId, selectedIndex: 0 },
      new Date().toISOString(),
    );

    expect(lateAnswer).toEqual({ error: "session_completed" });

    const oldSessionStillCompleted = (
      await client.query(`SELECT status FROM probe_sessions WHERE id = $1`, [started.id])
    ).rows[0];

    expect(oldSessionStillCompleted.status).toBe("completed");

    const replay = await answerProbeSession(
      { sessionId: started.id, questionId: firstQuestionId, selectedIndex: 0 },
      new Date().toISOString(),
    );

    expect("error" in replay).toBe(false);

    const oldSessionAfterReplay = (
      await client.query(`SELECT status, completed_at FROM probe_sessions WHERE id = $1`, [started.id])
    ).rows[0];

    expect(oldSessionAfterReplay.status).toBe("completed");
    expect(oldSessionAfterReplay.completed_at).not.toBeNull();
  }, 30_000);
});
