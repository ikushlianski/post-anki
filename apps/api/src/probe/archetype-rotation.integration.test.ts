import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 6 (.planning/36-archetype-rotation/scenarios.md) — the real-DB
// proof that LRU archetype state is shared across all three question-
// generation surfaces (push/startProbe, and both openNextConcept's and the
// retry branch's Socratic paths) via the one gapId-keyed gap_archetype_state
// table, and that same-session continuation reuses a turn's archetype
// verbatim. Harness shape mirrors
// apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts
// (real Postgres via DATABASE_URL/E2E_DATABASE_URL, assertLocalDbTarget
// guard, only the Mastra agent call mocked) exactly, per scenarios.md's own
// proof line for this scenario.

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

const dbName = `archetype_rotation_${randomUUID().replace(/-/g, "_")}`;
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

const mockAskGenerate = vi.fn();
const mockEvalGenerate = vi.fn();
const mockSocraticEvalGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { mentorAsk: "mentorAsk", mentorEval: "mentorEval", socraticEval: "socraticEval" },
  getMastra: () => ({
    getAgent: (key: string) => {
      if (key === "mentorAsk") return { generate: mockAskGenerate };
      if (key === "socraticEval") return { generate: mockSocraticEvalGenerate };

      return { generate: mockEvalGenerate };
    },
  }),
}));

vi.mock("../probe/probe-grounding.js", () => ({
  gatherProbeGrounding: vi.fn(async () => ({ text: "", citations: [] })),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { startSocraticSession, answerSocraticSession, completeSessionNow } = await import(
  "../socratic/socratic.service.js"
);
const { startProbe } = await import("./probe.service.js");

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

interface Scenery {
  topicId: string;
  gapId: string;
  curriculumId: string;
}

async function seedTopicWithGap(): Promise<Scenery> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Archetype rotation test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Archetype rotation test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Archetype rotation test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Archetype rotation test topic"],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, "Archetype rotation test gap"],
  );

  return { topicId, gapId, curriculumId };
}

async function archetypeStateRow(gapId: string) {
  const { rows } = await client.query(
    `SELECT applicable_archetypes, archetype_last_used_at FROM gap_archetype_state WHERE gap_id = $1`,
    [gapId],
  );

  return rows[0] ?? null;
}

async function turnArchetype(sessionId: string, gapId: string): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT archetype FROM socratic_turns WHERE session_id = $1 AND gap_id = $2 ORDER BY "order" DESC LIMIT 1`,
    [sessionId, gapId],
  );

  return rows[0]?.archetype ?? null;
}

function askObject(prompt: string, applicableArchetypes?: string[]) {
  return {
    object: {
      prompt,
      options: [],
      correctAnswerIndex: null,
      ...(applicableArchetypes ? { applicableArchetypes } : {}),
    },
  };
}

describe("SCENARIO 6 — cross-surface LRU sharing and same-session continuation against real Postgres", () => {
  it("classifies once, continues within a session, rotates across sessions, and shares state with startProbe", async () => {
    const scenery = await seedTopicWithGap();
    const now1 = "2026-08-01T10:00:00.000Z";
    const now2 = "2026-08-01T10:05:00.000Z";
    const now3 = "2026-08-01T10:10:00.000Z";
    const now4 = "2026-08-02T10:00:00.000Z";
    const now5 = "2026-08-03T10:00:00.000Z";

    // Step 1 — first-ever socratic question for this gap: classify + forced
    // Scenario-based framing.
    mockAskGenerate.mockResolvedValueOnce(
      askObject("Step 1 question", ["scenario_based", "design_challenge", "cross_cutting"]),
    );

    const session1 = await startSocraticSession({ topicId: scenery.topicId }, now1);

    if ("error" in session1) throw new Error(`unexpected error: ${session1.error}`);

    const firstPrompt = mockAskGenerate.mock.calls[0]![0] as string;

    expect(firstPrompt).toContain("Classify which of the 5 reference archetypes");
    expect(firstPrompt).toContain("Scenario-based framing");
    expect(firstPrompt).not.toContain("Prior sessions discussing this concept");

    expect(await turnArchetype(session1.id, scenery.gapId)).toBe("scenario_based");

    let state = await archetypeStateRow(scenery.gapId);

    expect(state.applicable_archetypes).toEqual([
      "scenario_based",
      "design_challenge",
      "cross_cutting",
    ]);
    expect(state.archetype_last_used_at.scenario_based).toBe(now1);
    expect(state.archetype_last_used_at.design_challenge).toBeNull();
    expect(state.archetype_last_used_at.cross_cutting).toBeNull();

    // Step 2 — learner answers wrong, retry branch fires within the SAME
    // session: continuation reuses "scenario_based" verbatim, no LRU write.
    mockSocraticEvalGenerate.mockResolvedValueOnce({
      object: {
        degree: "mostly_wrong",
        whatWasRight: "",
        pointOut: "not quite",
        explanation: "reconsider the tradeoff",
        correctAnswer: "the real answer",
      },
    });
    mockAskGenerate.mockResolvedValueOnce(askObject("Step 2 retry question"));

    const answer1 = await answerSocraticSession(
      { sessionId: session1.id, turnId: session1.current!.id, answer: "not sure" },
      now2,
    );

    if ("error" in answer1) throw new Error(`unexpected error: ${answer1.error}`);

    const secondPrompt = mockAskGenerate.mock.calls[1]![0] as string;

    expect(secondPrompt).not.toContain("Classify which of the 5 reference archetypes");
    expect(secondPrompt).not.toContain("Framing archetype for this question");
    expect(answer1.next).not.toBeNull();
    expect(await turnArchetype(session1.id, scenery.gapId)).toBe("scenario_based");

    state = await archetypeStateRow(scenery.gapId);
    expect(state.archetype_last_used_at.scenario_based).toBe(now1);
    expect(state.archetype_last_used_at.design_challenge).toBeNull();

    // Step 3 — session ends.
    await completeSessionNow(session1.id, now3);

    // Step 4 — a NEW session probes the same gap: fresh LRU selection
    // excludes scenario_based (most recently used) and picks design_challenge
    // (canonical position 3, earliest of the two remaining). Prior-session
    // context IS included this time (real Socratic history now exists).
    mockAskGenerate.mockResolvedValueOnce(askObject("Step 4 question"));

    const session2 = await startSocraticSession({ topicId: scenery.topicId }, now4);

    if ("error" in session2) throw new Error(`unexpected error: ${session2.error}`);

    const fourthPrompt = mockAskGenerate.mock.calls[2]![0] as string;

    expect(fourthPrompt).toContain("Framing archetype for this question: Design challenge");
    expect(fourthPrompt).not.toContain("Classify which of the 5 reference archetypes");
    expect(fourthPrompt).toContain("Prior sessions discussing this concept");

    expect(await turnArchetype(session2.id, scenery.gapId)).toBe("design_challenge");

    state = await archetypeStateRow(scenery.gapId);
    expect(state.archetype_last_used_at.scenario_based).toBe(now1);
    expect(state.archetype_last_used_at.design_challenge).toBe(now4);
    expect(state.archetype_last_used_at.cross_cutting).toBeNull();

    // Step 5 — startProbe, no session id, resurfaces the same still-open
    // gap: fresh LRU selection again, excluding design_challenge (now the
    // most recent) — cross_cutting (never used) wins over scenario_based
    // (used at now1).
    mockAskGenerate.mockResolvedValueOnce(askObject("Step 5 question"));

    const probeQuestion = await startProbe({ topicId: scenery.topicId, mode: "socratic" }, now5);

    if ("error" in probeQuestion) throw new Error(`unexpected error: ${probeQuestion.error}`);

    const fifthPrompt = mockAskGenerate.mock.calls[3]![0] as string;

    expect(fifthPrompt).toContain("Framing archetype for this question: Cross-cutting");
    expect(probeQuestion.archetype).toBe("cross_cutting");

    state = await archetypeStateRow(scenery.gapId);
    expect(state.archetype_last_used_at.scenario_based).toBe(now1);
    expect(state.archetype_last_used_at.design_challenge).toBe(now4);
    expect(state.archetype_last_used_at.cross_cutting).toBe(now5);
  }, 30_000);
});

describe("AC 22 — a classification that excludes scenario_based stamps nothing", () => {
  it("inserts the real applicable set but leaves archetypeLastUsedAt all-null", async () => {
    const scenery = await seedTopicWithGap();

    mockAskGenerate.mockResolvedValueOnce(askObject("Debug-only question", ["debug_challenge"]));

    const result = await startProbe(
      { topicId: scenery.topicId, mode: "socratic" },
      "2026-08-01T00:00:00.000Z",
    );

    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);

    const state = await archetypeStateRow(scenery.gapId);

    expect(state.applicable_archetypes).toEqual(["debug_challenge"]);
    expect(state.archetype_last_used_at.scenario_based).toBeNull();
    expect(state.archetype_last_used_at.debug_challenge).toBeNull();
  }, 30_000);
});

describe("AC 25 — an agent failure never writes archetype state", () => {
  it("leaves no gap_archetype_state row after a failed generation, and the next real attempt starts clean", async () => {
    const scenery = await seedTopicWithGap();

    mockAskGenerate.mockRejectedValueOnce(new Error("agent unavailable"));

    const failed = await startProbe(
      { topicId: scenery.topicId, mode: "socratic" },
      "2026-08-01T00:00:00.000Z",
    );

    if ("error" in failed) throw new Error(`unexpected error: ${failed.error}`);

    expect(failed.archetype).toBeNull();
    expect(await archetypeStateRow(scenery.gapId)).toBeNull();

    mockAskGenerate.mockResolvedValueOnce(askObject("Real question", ["scenario_based"]));

    const succeeded = await startProbe(
      { topicId: scenery.topicId, mode: "socratic" },
      "2026-08-01T00:05:00.000Z",
    );

    if ("error" in succeeded) throw new Error(`unexpected error: ${succeeded.error}`);

    const secondPrompt = mockAskGenerate.mock.calls[1]![0] as string;

    expect(secondPrompt).toContain("Classify which of the 5 reference archetypes");
    expect(await archetypeStateRow(scenery.gapId)).not.toBeNull();
  }, 30_000);
});

describe("AC 32 — a gap only ever probed via push/startProbe never gets a prior-sessions context block", () => {
  it("rotates the archetype across repeated startProbe calls with no socratic_turns history, and no context block ever appears", async () => {
    const scenery = await seedTopicWithGap();

    mockAskGenerate.mockResolvedValueOnce(
      askObject("First push question", ["scenario_based", "compare_contrast"]),
    );

    const first = await startProbe(
      { topicId: scenery.topicId, mode: "socratic" },
      "2026-08-01T00:00:00.000Z",
    );

    if ("error" in first) throw new Error(`unexpected error: ${first.error}`);
    expect(first.archetype).toBe("scenario_based");

    mockAskGenerate.mockResolvedValueOnce(askObject("Second push question"));

    const second = await startProbe(
      { topicId: scenery.topicId, mode: "socratic" },
      "2026-08-01T00:10:00.000Z",
    );

    if ("error" in second) throw new Error(`unexpected error: ${second.error}`);

    const secondPrompt = mockAskGenerate.mock.calls[1]![0] as string;

    expect(second.archetype).toBe("compare_contrast");
    expect(secondPrompt).not.toContain("Prior sessions discussing this concept");
  }, 30_000);
});
