import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnswerSocraticResult,
  CheckSessionIdleResult,
  CompleteSocraticSessionResult,
  Gap,
} from "@post-anki/shared";
import type { TopicRow } from "../topic/topic-progress.repo.js";
import type { SocraticSessionRow, SocraticTurnRow } from "./socratic.repo.js";

// A small stateful fake of socratic.repo.js — the checkpoint/finalize logic
// under test lives entirely in socratic.service.ts and depends on turn
// count and session status evolving realistically across several sequential
// calls (five-plus exchanges in one session), which a value-only mock
// can't express. Mirrors this codebase's existing pattern of mocking
// dependency modules with `vi.fn()` wrappers (probe.service.test.ts), just
// backed by an in-memory store instead of fixed return values.
const callLog: string[] = [];

let sessionRow: SocraticSessionRow;
let turnsStore: SocraticTurnRow[];

function resetFakeSocraticRepo(overrides: Partial<SocraticSessionRow> = {}): void {
  sessionRow = {
    id: "ss1",
    topicId: "t1",
    curriculumId: "c1",
    status: "active",
    createdAt: new Date("2026-08-14T08:00:00.000Z"),
    completedAt: null,
    checkpointShownAt: null,
    ...overrides,
  };
  turnsStore = [];
  callLog.length = 0;
}

function seedTurn(over: Partial<SocraticTurnRow> = {}): SocraticTurnRow {
  const turn: SocraticTurnRow = {
    id: "turn-1",
    sessionId: "ss1",
    gapId: "g1",
    conceptLabel: "Server functions",
    order: turnsStore.length + 1,
    prompt: "Explain a server function.",
    answer: null,
    degree: null,
    action: null,
    createdAt: new Date("2026-08-14T08:00:00.000Z"),
    answeredAt: null,
    archetype: null,
    ...over,
  };

  turnsStore.push(turn);

  return turn;
}

const getSocraticSessionRow = vi.fn(async (id: string) =>
  sessionRow.id === id ? { ...sessionRow } : null,
);
const getTurnRow = vi.fn(async (id: string) => {
  const t = turnsStore.find((x) => x.id === id);

  return t ? { ...t } : null;
});
const listTurnRows = vi.fn(async (sessionId: string) => {
  callLog.push("listTurnRows");

  return turnsStore
    .filter((t) => t.sessionId === sessionId)
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ ...t }));
});
const pendingTurn = vi.fn(async (sessionId: string) => {
  const rows = turnsStore
    .filter((t) => t.sessionId === sessionId && t.answer === null)
    .sort((a, b) => b.order - a.order);

  return rows[0] ? { ...rows[0] } : null;
});
const insertTurn = vi.fn(async (turn: SocraticTurnRow) => {
  turnsStore.push({ ...turn });
});
const recordTurnAnswer = vi.fn(
  async (turnId: string, answer: string, degree: string, action: string, now: string) => {
    callLog.push("recordTurnAnswer");
    const t = turnsStore.find((x) => x.id === turnId);

    if (t) {
      t.answer = answer;
      t.degree = degree as never;
      t.action = action as never;
      t.answeredAt = new Date(now);
    }
  },
);
const completeSocraticSession = vi.fn(async (id: string, now: string) => {
  if (sessionRow.id === id && sessionRow.status === "active") {
    sessionRow = { ...sessionRow, status: "completed", completedAt: new Date(now) };

    return { ...sessionRow };
  }

  return null;
});
const markCheckpointShown = vi.fn(async (id: string, now: string) => {
  if (sessionRow.id === id && sessionRow.checkpointShownAt === null) {
    sessionRow = { ...sessionRow, checkpointShownAt: new Date(now) };
  }
});
const createSocraticSession = vi.fn(async (session: SocraticSessionRow) => {
  sessionRow = { ...session };
});
const getActiveSocraticSessionRow = vi.fn(async () => null);

vi.mock("./socratic.repo.js", () => ({
  getSocraticSessionRow: (id: string) => getSocraticSessionRow(id),
  getTurnRow: (id: string) => getTurnRow(id),
  listTurnRows: (sessionId: string) => listTurnRows(sessionId),
  pendingTurn: (sessionId: string) => pendingTurn(sessionId),
  insertTurn: (turn: SocraticTurnRow) => insertTurn(turn),
  recordTurnAnswer: (
    turnId: string,
    answer: string,
    degree: string,
    action: string,
    now: string,
  ) => recordTurnAnswer(turnId, answer, degree, action, now),
  completeSocraticSession: (id: string, now: string) => completeSocraticSession(id, now),
  markCheckpointShown: (id: string, now: string) => markCheckpointShown(id, now),
  createSocraticSession: (session: SocraticSessionRow) => createSocraticSession(session),
  getActiveSocraticSessionRow: () => getActiveSocraticSessionRow(),
}));

const TOPIC_ROW = {
  id: "t1",
  title: "TanStack Start",
  depth: "working",
} as unknown as TopicRow;

const GAP: Gap = {
  id: "g1",
  topicId: "t1",
  label: "Server functions",
  depth: "working",
  origin: "ai",
  state: "open",
  wanted: true,
  concern: null,
  lastEvaluatedAt: null,
  triageState: "untriaged",
  triagedAt: null,
  deferredUntil: null,
  deferralCount: 0,
  dismissedAt: null,
  dismissedCheckinSentAt: null,
  untriagedSince: "2026-06-24T00:00:00.000Z",
  autoDeferredAt: null,
};

const getTopicRow = vi.fn(async () => TOPIC_ROW);
const writeTopicProgress = vi.fn(async (..._args: unknown[]) => {});

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: () => getTopicRow(),
  rowDepth: (row: TopicRow) => row.depth,
  writeTopicProgress: (...args: unknown[]) => writeTopicProgress(...args),
}));

const listGapsForTopic = vi.fn(async () => [GAP]);
const persistGaps = vi.fn(async (_gaps: unknown) => {});

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: () => listGapsForTopic(),
  persistGaps: (gaps: unknown) => persistGaps(gaps),
}));

vi.mock("../probe/probe-grounding.js", () => ({
  gatherProbeGrounding: vi.fn(async () => ({ text: "", citations: [] })),
}));

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: vi.fn(async () => ({
    curriculumId: "c1",
    status: "confirmed",
    speed: "normal",
    hinting: false,
  })),
}));

const buildProbeQuestionForGap = vi.fn(
  async (..._args: unknown[]) => null as null | { prompt: string; archetype: string | null },
);

vi.mock("../probe/probe.service.js", () => ({
  buildProbeQuestionForGap: (...args: unknown[]) => buildProbeQuestionForGap(...args),
}));

vi.mock("../streak/streak.service.js", () => ({
  recordActivityToday: vi.fn(async () => {}),
}));

vi.mock("../liveness/answer-activity.js", () => ({
  recordAnswerActivity: vi.fn(async () => {}),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { socraticEval: "socraticEval" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

const { answerSocraticSession, checkSessionIdle, completeSessionNow, startSocraticSession } =
  await import("./socratic.service.js");

function unwrapAnswer(
  result: AnswerSocraticResult | { error: unknown },
): AnswerSocraticResult {
  if ("error" in result) {
    throw new Error(`unexpected error result: ${String(result.error)}`);
  }

  return result;
}

function unwrapComplete(
  result: CompleteSocraticSessionResult | { error: unknown },
): CompleteSocraticSessionResult {
  if ("error" in result) {
    throw new Error(`unexpected error result: ${String(result.error)}`);
  }

  return result;
}

function unwrapIdle(
  result: CheckSessionIdleResult | { error: unknown },
): CheckSessionIdleResult {
  if ("error" in result) {
    throw new Error(`unexpected error result: ${String(result.error)}`);
  }

  return result;
}

async function answer(turnId: string, now: string) {
  const result = await answerSocraticSession({ sessionId: "ss1", turnId, answer: "yes" }, now);

  return unwrapAnswer(result);
}

describe("answerSocraticSession — soft checkpoint at 5+ exchanges (issue #27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeSocraticRepo();
    seedTurn();
    getTopicRow.mockResolvedValue(TOPIC_ROW);
    listGapsForTopic.mockResolvedValue([GAP]);
    generate.mockResolvedValue({
      object: {
        degree: "correct",
        whatWasRight: "",
        pointOut: "",
        explanation: "",
        correctAnswer: "",
      },
    });
  });

  it("does not fire before the 5th answered turn, and fires exactly on it (AC 5, 6, 9)", async () => {
    let turnId = "turn-1";

    for (let i = 1; i <= 4; i++) {
      const result = await answer(turnId, `2026-08-14T08:0${i}:00.000Z`);

      expect(result.checkpointReached).toBe(false);
      expect(result.status).toBe("active");
      turnId = result.next!.id;
    }

    const fifth = await answer(turnId, "2026-08-14T08:05:00.000Z");

    expect(fifth.checkpointReached).toBe(true);
    expect(fifth.status).toBe("active");
    expect(fifth.checkpointSummary).not.toBeNull();
    expect(fifth.checkpointSummary!.exchangeCount).toBe(5);
  });

  it("never re-fires on exchange 6, 7, 8 once already shown this session (AC 13)", async () => {
    let turnId = "turn-1";

    for (let i = 1; i <= 5; i++) {
      const result = await answer(turnId, `2026-08-14T08:0${i}:00.000Z`);
      turnId = result.next!.id;
    }

    for (let i = 6; i <= 8; i++) {
      const result = await answer(turnId, `2026-08-14T08:0${i}:00.000Z`);

      expect(result.checkpointReached).toBe(false);
      expect(result.checkpointSummary).toBeNull();
      turnId = result.next!.id;
    }
  });

  it("never re-triggers when checkpointShownAt is already set, even past the threshold (AC 6)", async () => {
    resetFakeSocraticRepo({ checkpointShownAt: new Date("2026-08-14T08:00:00.000Z") });
    seedTurn();

    for (let i = 0; i < 5; i++) {
      seedTurn({
        id: `pre-${i}`,
        order: turnsStore.length + 1,
        answer: "yes",
        degree: "correct",
        action: "advance",
        answeredAt: new Date("2026-08-14T07:00:00.000Z"),
      });
    }

    const result = await answer(turnsStore[0]!.id, "2026-08-14T09:00:00.000Z");

    expect(result.checkpointReached).toBe(false);
    expect(markCheckpointShown).not.toHaveBeenCalled();
  });

  it("keeps generating `next` eagerly and unmodified — checkpointReached is additive, not a branch that skips generation (AC 8)", async () => {
    let turnId = "turn-1";

    for (let i = 1; i <= 4; i++) {
      const result = await answer(turnId, `2026-08-14T08:0${i}:00.000Z`);
      turnId = result.next!.id;
    }

    const fifth = await answer(turnId, "2026-08-14T08:05:00.000Z");

    expect(fifth.checkpointReached).toBe(true);
    expect(fifth.next).not.toBeNull();
    expect(fifth.covered).toBe(true);
  });

  // AC 5 is an ordering claim, not just a value claim: the answered-turn
  // count that decides checkpointReached must be read AFTER
  // recordTurnAnswer persists the just-answered turn, not before.
  it("computes the checkpoint count from a listTurnRows call issued AFTER recordTurnAnswer (AC 5)", async () => {
    await answer("turn-1", "2026-08-14T08:01:00.000Z");

    const recordIndex = callLog.indexOf("recordTurnAnswer");
    const checkpointCountIndex = callLog.lastIndexOf("listTurnRows");

    expect(recordIndex).toBeGreaterThanOrEqual(0);
    expect(checkpointCountIndex).toBeGreaterThan(recordIndex);
  });
});

describe("finalizeSession (shared by /done and the inactivity sweep) — issue #27", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeSocraticRepo();
    getTopicRow.mockResolvedValue(TOPIC_ROW);
    listGapsForTopic.mockResolvedValue([GAP]);
  });

  it("completeSessionNow marks a never-answered session completed but returns no summary (AC 30)", async () => {
    seedTurn({ answer: null, answeredAt: null });

    const result = unwrapComplete(await completeSessionNow("ss1", "2026-08-14T09:00:00.000Z"));

    expect(result.completed).toBe(true);
    expect(result.summary).toBeNull();
    expect(sessionRow.status).toBe("completed");
  });

  it("completeSessionNow returns a real summary once at least one turn was answered (Scenario 2)", async () => {
    seedTurn({
      answer: "yes",
      degree: "correct",
      action: "advance",
      answeredAt: new Date("2026-08-14T08:00:00.000Z"),
    });

    const result = unwrapComplete(await completeSessionNow("ss1", "2026-08-14T09:00:00.000Z"));

    expect(result.completed).toBe(true);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.exchangeCount).toBe(1);
    expect(result.summary!.solidConcepts).toEqual(["Server functions"]);
    // AC 28/29 — the honest-zero-gaps state, even for a session with real
    // solid-understanding content.
    expect(result.summary!.mostRecentGap).toBeNull();
    expect(result.summary!.gapsLoggedCount).toBe(0);
  });

  it("a second finalize call on an already-completed session loses the race and sends nothing (AC 24-26)", async () => {
    seedTurn({
      answer: "yes",
      degree: "correct",
      action: "advance",
      answeredAt: new Date("2026-08-14T08:00:00.000Z"),
    });

    const first = unwrapComplete(await completeSessionNow("ss1", "2026-08-14T09:00:00.000Z"));
    const second = unwrapComplete(await completeSessionNow("ss1", "2026-08-14T09:00:05.000Z"));

    expect(first.completed).toBe(true);
    expect(second.completed).toBe(false);
    expect(second.summary).toBeNull();
  });

  it("checkSessionIdle returns idle:false when the pending turn is under 30 minutes old (AC 18)", async () => {
    seedTurn({ createdAt: new Date("2026-08-14T08:45:00.000Z") });

    const result = unwrapIdle(await checkSessionIdle("ss1", "2026-08-14T09:00:00.000Z"));

    expect(result).toEqual({ idle: false });
    expect(sessionRow.status).toBe("active");
  });

  it("checkSessionIdle completes the session and returns a summary once 30+ minutes have passed (AC 19)", async () => {
    seedTurn({
      id: "answered-1",
      order: 1,
      answer: "yes",
      degree: "correct",
      action: "advance",
      answeredAt: new Date("2026-08-14T08:00:00.000Z"),
    });
    seedTurn({ id: "pending-1", order: 2, createdAt: new Date("2026-08-14T08:10:00.000Z") });

    const result = unwrapIdle(await checkSessionIdle("ss1", "2026-08-14T08:41:00.000Z"));

    expect(result.idle).toBe(true);
    expect(result.summary).not.toBeNull();
    expect(sessionRow.status).toBe("completed");
  });

  it("checkSessionIdle never reads chat_context — its only inputs are the session's own turns/pending state (AC 17)", async () => {
    seedTurn({ createdAt: new Date("2026-08-14T08:00:00.000Z") });

    await checkSessionIdle("ss1", "2026-08-14T08:40:00.000Z");

    expect(pendingTurn).toHaveBeenCalledWith("ss1");
    expect(listTurnRows).toHaveBeenCalledWith("ss1");
  });
});

describe("LRU archetype rotation (issue #36) — session-id threading and turn stamping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeSocraticRepo();
    getTopicRow.mockResolvedValue(TOPIC_ROW);
    listGapsForTopic.mockResolvedValue([GAP]);
  });

  it("AC 27, 30 — opening a new concept passes session.id as the trailing socraticSessionId and stamps the returned archetype onto the new turn", async () => {
    buildProbeQuestionForGap.mockResolvedValueOnce({
      prompt: "Framed question",
      archetype: "cross_cutting",
    });

    const result = await startSocraticSession({ topicId: "t1" }, "2026-08-14T08:00:00.000Z");

    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);

    expect(buildProbeQuestionForGap).toHaveBeenCalledWith(
      "t1",
      GAP,
      "socratic",
      "2026-08-14T08:00:00.000Z",
      result.id,
    );

    const insertedTurn = insertTurn.mock.calls[0]![0] as { archetype: string | null };

    expect(insertedTurn.archetype).toBe("cross_cutting");
  });

  it("AC 27, 30 — the retry branch (answerSocraticSession, same gap still open) also passes session.id, and stamps the reused archetype", async () => {
    seedTurn({ id: "turn-1", archetype: "scenario_based" });
    generate.mockResolvedValue({
      object: {
        degree: "mostly_wrong",
        whatWasRight: "",
        pointOut: "not quite",
        explanation: "reconsider",
        correctAnswer: "the real answer",
      },
    });
    buildProbeQuestionForGap.mockResolvedValueOnce({
      prompt: "Continuation question",
      archetype: "scenario_based",
    });

    const result = await answer("turn-1", "2026-08-14T08:01:00.000Z");

    expect(buildProbeQuestionForGap).toHaveBeenCalledWith(
      "t1",
      GAP,
      "socratic",
      "2026-08-14T08:01:00.000Z",
      "ss1",
    );
    expect(result.next?.id).toBeDefined();

    const insertedTurn = insertTurn.mock.calls[0]![0] as { archetype: string | null };

    expect(insertedTurn.archetype).toBe("scenario_based");
  });

  it("stamps archetype: null on the new turn when buildProbeQuestionForGap falls back to null (defensive)", async () => {
    buildProbeQuestionForGap.mockResolvedValueOnce(null);

    await startSocraticSession({ topicId: "t1" }, "2026-08-14T08:00:00.000Z");

    const insertedTurn = insertTurn.mock.calls[0]![0] as { archetype: string | null };

    expect(insertedTurn.archetype).toBeNull();
  });
});
