import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gap } from "@post-anki/shared";
import { localEvaluation, shouldScoreLocally } from "./probe-evaluation.js";

const evalGenerate = vi.fn();
const askGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { mentorAsk: "mentorAsk", mentorEval: "mentorEval" },
  getMastra: () => ({
    getAgent: (key: string) =>
      key === "mentorEval" ? { generate: evalGenerate } : { generate: askGenerate },
  }),
}));

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
  rowDepth: () => "working",
  writeTopicProgress: vi.fn(),
}));

const listGapsForTopic = vi.fn();
const persistGaps = vi.fn();

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: (id: string) => listGapsForTopic(id),
  persistGaps: (gaps: unknown) => persistGaps(gaps),
  insertDiscoveredGaps: vi.fn(async () => []),
}));

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: vi.fn(async () => ({
    curriculumId: "c1",
    status: "confirmed",
    speed: "normal",
    hinting: false,
  })),
  getLowerLevelCoverage: vi.fn(async () => []),
}));

vi.mock("./probe-grounding.js", () => ({
  gatherProbeGrounding: vi.fn(async () => ({ text: "", citations: [] })),
}));

vi.mock("../feedback/feedback.repo.js", () => ({
  getFeedbackForTopic: vi.fn(async () => []),
}));

const recordAnswerActivity = vi.fn();

vi.mock("../liveness/answer-activity.js", () => ({
  recordAnswerActivity: (curriculumId: string | null, now: string) =>
    recordAnswerActivity(curriculumId, now),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const getGapArchetypeState = vi.fn();
const recordArchetypeClassification = vi.fn();
const recordArchetypeUsage = vi.fn();

vi.mock("../gap/gap-archetype.repo.js", () => ({
  getGapArchetypeState: (gapId: string) => getGapArchetypeState(gapId),
  recordArchetypeClassification: (...args: unknown[]) =>
    recordArchetypeClassification(...args),
  recordArchetypeUsage: (...args: unknown[]) => recordArchetypeUsage(...args),
}));

const getMostRecentTurnArchetype = vi.fn();
const getRecentSessionExchangesForGap = vi.fn();

vi.mock("../socratic/socratic.repo.js", () => ({
  getMostRecentTurnArchetype: (...args: unknown[]) => getMostRecentTurnArchetype(...args),
  getRecentSessionExchangesForGap: (...args: unknown[]) =>
    getRecentSessionExchangesForGap(...args),
}));

vi.mock("@post-anki/core", async () => {
  const actual = await vi.importActual<typeof import("@post-anki/core")>("@post-anki/core");

  return actual;
});

const { startProbe, submitProbe } = await import("./probe.service.js");

const topicRow = {
  id: "t1",
  curriculumId: "c1",
  title: "Networking",
  summary: null,
  depth: "working",
  progressAttempts: 0,
};

function makeGap(over: Partial<Gap> = {}): Gap {
  return {
    id: "g1",
    topicId: "t1",
    label: "TCP handshake",
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
    ...over,
  };
}

describe("shouldScoreLocally", () => {
  it("scores locally only for quick_test on a probed gap", () => {
    expect(shouldScoreLocally("quick_test", makeGap())).toBe(true);
    expect(shouldScoreLocally("quick_test", null)).toBe(false);
    expect(shouldScoreLocally("socratic", makeGap())).toBe(false);
  });
});

describe("localEvaluation", () => {
  it("marks covered on pass and open on fail", () => {
    const gap = makeGap();

    expect(localEvaluation(gap, "pass")).toEqual({
      verdicts: [{ gapId: "g1", covered: true }],
      newGaps: [],
      nextPrompt: null,
    });
    expect(localEvaluation(gap, "fail").verdicts[0]?.covered).toBe(false);
    expect(localEvaluation(gap, undefined).verdicts[0]?.covered).toBe(false);
  });
});

describe("submitProbe quick_test deterministic path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    listGapsForTopic.mockResolvedValue([makeGap()]);
  });

  it("covers a probed gap on pass without calling the eval agent", async () => {
    const result = await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "quick_test", answer: "0", selfOutcome: "pass" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(evalGenerate).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);

    if (!("error" in result)) {
      expect(result.outcome).toBe("pass");
      expect(result.coveredGapLabels).toContain("TCP handshake");
      expect(result.nextQuestion).toBeNull();
    }
  });

  it("leaves a probed gap open on fail without calling the eval agent", async () => {
    const result = await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "quick_test", answer: "1", selfOutcome: "fail" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(evalGenerate).not.toHaveBeenCalled();

    if (!("error" in result)) {
      expect(result.outcome).toBe("fail");
      expect(result.coveredGapLabels).not.toContain("TCP handshake");
    }
  });
});

describe("submitProbe opener discovery path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    listGapsForTopic.mockResolvedValue([]);
    evalGenerate.mockResolvedValue({
      object: { verdicts: [], newGaps: [], nextPrompt: null },
    });
  });

  it("calls the eval agent for a quick_test opener (gapId null)", async () => {
    const result = await submitProbe(
      { topicId: "t1", gapId: null, mode: "quick_test", answer: "explanation" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(evalGenerate).toHaveBeenCalledTimes(1);

    if (!("error" in result)) {
      expect(result.nextQuestion).toBeNull();
    }
  });
});

describe("submitProbe provenance-linked liveness activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    listGapsForTopic.mockResolvedValue([makeGap()]);
  });

  it("records activity against the curriculum the answered gap traces back to", async () => {
    await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "quick_test", answer: "0", selfOutcome: "pass" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(recordAnswerActivity).toHaveBeenCalledWith("c1", "2026-06-24T00:00:00.000Z");
  });

  it("records no activity when the topic is not found", async () => {
    getTopicRow.mockResolvedValue(null);

    await submitProbe(
      { topicId: "missing", gapId: null, mode: "quick_test", answer: "0" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(recordAnswerActivity).not.toHaveBeenCalled();
  });
});

describe("startProbe quick_test question", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    listGapsForTopic.mockResolvedValue([makeGap()]);
    askGenerate.mockResolvedValue({
      object: {
        prompt: "Pick one",
        options: ["a", "b", "c", "d"],
        correctAnswerIndex: 2,
      },
    });
  });

  it("includes correctAnswerIndex from the generated question", async () => {
    const result = await startProbe({ topicId: "t1", mode: "quick_test" });

    expect("error" in result).toBe(false);

    if (!("error" in result)) {
      expect(result.correctAnswerIndex).toBe(2);
      expect(result.kind).toBe("quick_test");
    }
  });
});

describe("submitProbe auto-defer reactivation (issue #33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
  });

  it("AC 24a — a MISSING verdict on the freeform path reactivates an auto-deferred probed gap", async () => {
    listGapsForTopic.mockResolvedValue([
      makeGap({ triageState: "auto_deferred", autoDeferredAt: "2026-06-20T00:00:00.000Z" }),
    ]);
    evalGenerate.mockResolvedValue({
      object: { verdicts: [], newGaps: [], nextPrompt: null },
    });

    const result = await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "socratic", answer: "not quite" },
      "2026-06-24T00:00:00.000Z",
    );

    expect("error" in result).toBe(false);

    if (!("error" in result)) {
      expect(result.outcome).toBe("fail");
    }

    expect(persistGaps).toHaveBeenCalledTimes(1);
    const [persisted] = persistGaps.mock.calls[0]![0] as Gap[];

    expect(persisted!.triageState).toBe("untriaged");
    expect(persisted!.untriagedSince).toBe("2026-06-24T00:00:00.000Z");
    expect(persisted!.autoDeferredAt).toBeNull();
  });

  it("AC 24d — a PASS verdict on an auto-deferred gap covers it and does not reactivate it", async () => {
    listGapsForTopic.mockResolvedValue([
      makeGap({ triageState: "auto_deferred", autoDeferredAt: "2026-06-20T00:00:00.000Z" }),
    ]);
    evalGenerate.mockResolvedValue({
      object: { verdicts: [{ gapId: "g1", covered: true }], newGaps: [], nextPrompt: null },
    });

    const result = await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "socratic", answer: "yes exactly" },
      "2026-06-24T00:00:00.000Z",
    );

    if (!("error" in result)) {
      expect(result.outcome).toBe("pass");
    }

    const [persisted] = persistGaps.mock.calls[0]![0] as Gap[];

    expect(persisted!.state).toBe("covered");
    expect(persisted!.triageState).toBe("auto_deferred");
    expect(persisted!.autoDeferredAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("AC 22 — a Fail on a plain (not-yet-due) untriaged gap resets nothing", async () => {
    listGapsForTopic.mockResolvedValue([makeGap({ triageState: "untriaged" })]);

    await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "quick_test", answer: "1", selfOutcome: "fail" },
      "2026-06-24T00:00:00.000Z",
    );

    const [persisted] = persistGaps.mock.calls[0]![0] as Gap[];

    expect(persisted!.triageState).toBe("untriaged");
    expect(persisted!.untriagedSince).toBe("2026-06-24T00:00:00.000Z");
  });

  it("AC 24c — outcome and coveredGapLabels are unaffected by the probedFailed hoist (byte-identical to before)", async () => {
    listGapsForTopic.mockResolvedValue([
      makeGap({ triageState: "auto_deferred", autoDeferredAt: "2026-06-20T00:00:00.000Z" }),
    ]);
    evalGenerate.mockResolvedValue({
      object: { verdicts: [], newGaps: [], nextPrompt: null },
    });

    const result = await submitProbe(
      { topicId: "t1", gapId: "g1", mode: "socratic", answer: "not quite" },
      "2026-06-24T00:00:00.000Z",
    );

    if (!("error" in result)) {
      expect(result.outcome).toBe("fail");
      expect(result.coveredGapLabels).not.toContain("TCP handshake");
    }

    const [persisted] = persistGaps.mock.calls[0]![0] as Gap[];

    expect(persisted!.state).toBe("open");
    expect(persisted!.lastEvaluatedAt).toBeNull();
  });
});

describe("startProbe depth-calibration staleness (#26/#42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    askGenerate.mockResolvedValue({
      object: { prompt: "Pick one", options: ["a", "b", "c", "d"], correctAnswerIndex: 2 },
    });
  });

  it("floors Target depth to awareness for a gap not evaluated in 60+ days, without writing gaps.depth", async () => {
    listGapsForTopic.mockResolvedValue([
      makeGap({ depth: "working", lastEvaluatedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    await startProbe({ topicId: "t1", mode: "quick_test" }, "2026-06-24T00:00:00.000Z");

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Target depth: awareness");
    expect(prompt).not.toContain("Target depth: working");
    expect(persistGaps).not.toHaveBeenCalled();
  });

  it("keeps the gap's real depth when it was evaluated recently", async () => {
    listGapsForTopic.mockResolvedValue([
      makeGap({ depth: "working", lastEvaluatedAt: "2026-06-20T00:00:00.000Z" }),
    ]);

    await startProbe({ topicId: "t1", mode: "quick_test" }, "2026-06-24T00:00:00.000Z");

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Target depth: working");
    expect(prompt).not.toContain("Target depth: awareness");
  });

  it("keeps the gap's real depth when it has never been evaluated", async () => {
    listGapsForTopic.mockResolvedValue([makeGap({ depth: "working", lastEvaluatedAt: null })]);

    await startProbe({ topicId: "t1", mode: "quick_test" }, "2026-06-24T00:00:00.000Z");

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Target depth: working");
  });
});

describe("LRU archetype rotation (issue #36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(topicRow);
    getMostRecentTurnArchetype.mockResolvedValue(null);
    getRecentSessionExchangesForGap.mockResolvedValue([]);
  });

  it("never touches archetype state for a quick_test question, even with a real gap (AC 19, 26)", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    askGenerate.mockResolvedValue({
      object: { prompt: "Pick one", options: ["a", "b", "c", "d"], correctAnswerIndex: 1 },
    });

    const result = await startProbe({ topicId: "t1", mode: "quick_test" });

    expect(getGapArchetypeState).not.toHaveBeenCalled();
    expect(recordArchetypeClassification).not.toHaveBeenCalled();
    expect(recordArchetypeUsage).not.toHaveBeenCalled();

    if (!("error" in result)) {
      expect(result.archetype).toBeNull();
    }
  });

  it("never touches archetype state for the opening question (gap === null), even in socratic mode (AC 19, 26)", async () => {
    listGapsForTopic.mockResolvedValue([]);
    askGenerate.mockResolvedValue({
      object: { prompt: "Tell me about this topic", options: [], correctAnswerIndex: null },
    });

    const result = await startProbe({ topicId: "t1", mode: "socratic" });

    expect(getGapArchetypeState).not.toHaveBeenCalled();

    if (!("error" in result)) {
      expect(result.archetype).toBeNull();
    }
  });

  it("SCENARIO 1 / AC 20 — a gap's first-ever socratic question asks the model to classify AND forces Scenario-based framing", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getGapArchetypeState.mockResolvedValue(null);
    askGenerate.mockResolvedValue({
      object: {
        prompt: "Walk me through it",
        options: [],
        correctAnswerIndex: null,
        applicableArchetypes: ["scenario_based", "design_challenge"],
      },
    });

    const result = await startProbe(
      { topicId: "t1", mode: "socratic" },
      "2026-06-24T00:00:00.000Z",
    );

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Classify which of the 5 reference archetypes");
    expect(prompt).toContain("Scenario-based framing");
    expect(prompt).not.toContain("Framing archetype for this question");

    expect(recordArchetypeClassification).toHaveBeenCalledWith(
      "g1",
      ["scenario_based", "design_challenge"],
      "scenario_based",
      "2026-06-24T00:00:00.000Z",
    );
    expect(recordArchetypeUsage).not.toHaveBeenCalled();

    if (!("error" in result)) {
      expect(result.archetype).toBe("scenario_based");
    }
  });

  it("SCENARIO 2 / AC 23, 24 — an already-classified gap gets no classification instruction, just the framing line, and only recordArchetypeUsage fires", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getGapArchetypeState.mockResolvedValue({
      gapId: "g1",
      applicableArchetypes: ["scenario_based", "design_challenge", "cross_cutting"],
      archetypeLastUsedAt: {
        scenario_based: "2026-06-20T00:00:00.000Z",
        compare_contrast: null,
        design_challenge: null,
        cross_cutting: null,
        debug_challenge: null,
      },
    });
    askGenerate.mockResolvedValue({
      object: { prompt: "Today's specific question", options: [], correctAnswerIndex: null },
    });

    const result = await startProbe(
      { topicId: "t1", mode: "socratic" },
      "2026-06-24T00:00:00.000Z",
    );

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).not.toContain("Classify which of the 5 reference archetypes");
    // scenario_based excluded (most recently used); design_challenge (canonical
    // position 3) is earliest of the two remaining never-used candidates.
    expect(prompt).toContain("Framing archetype for this question: Design challenge");

    expect(recordArchetypeClassification).not.toHaveBeenCalled();
    expect(recordArchetypeUsage).toHaveBeenCalledWith(
      "g1",
      "design_challenge",
      "2026-06-24T00:00:00.000Z",
    );

    if (!("error" in result)) {
      expect(result.archetype).toBe("design_challenge");
    }
  });

  it("includes the prior-sessions context block only when getRecentSessionExchangesForGap returns real history (AC 34)", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getGapArchetypeState.mockResolvedValue({
      gapId: "g1",
      applicableArchetypes: ["scenario_based", "design_challenge"],
      archetypeLastUsedAt: { scenario_based: null, compare_contrast: null, design_challenge: null, cross_cutting: null, debug_challenge: null },
    });
    getRecentSessionExchangesForGap.mockResolvedValue([
      {
        sessionId: "ss-old",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        turns: [{ prompt: "Old question?", answer: "Old answer" }],
      },
    ]);
    askGenerate.mockResolvedValue({
      object: { prompt: "Fresh question", options: [], correctAnswerIndex: null },
    });

    await startProbe({ topicId: "t1", mode: "socratic" }, "2026-06-24T00:00:00.000Z");

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Prior sessions discussing this concept");
    expect(prompt).toContain("Old question?");
  });

  it("SCENARIO 3 / AC 29 — same-session continuation reuses the archetype verbatim, no LRU selection, no write, no classification", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getMostRecentTurnArchetype.mockResolvedValue("cross_cutting");
    askGenerate.mockResolvedValue({
      object: { prompt: "Continuation question", options: [], correctAnswerIndex: null },
    });

    const question = await (
      await import("./probe.service.js")
    ).buildProbeQuestionForGap(
      "t1",
      makeGap(),
      "socratic",
      "2026-06-24T00:00:00.000Z",
      "session-1",
    );

    expect(getMostRecentTurnArchetype).toHaveBeenCalledWith("session-1", "g1");
    expect(getGapArchetypeState).not.toHaveBeenCalled();
    expect(recordArchetypeClassification).not.toHaveBeenCalled();
    expect(recordArchetypeUsage).not.toHaveBeenCalled();

    const prompt = askGenerate.mock.calls[0]![0] as string;

    expect(prompt).not.toContain("Framing archetype for this question");
    expect(prompt).not.toContain("Classify which of the 5 reference archetypes");
    expect(question?.archetype).toBe("cross_cutting");
  });

  it("SCENARIO 5 / AC 25 — an agent failure writes no archetype state and returns archetype: null", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getGapArchetypeState.mockResolvedValue(null);
    askGenerate.mockRejectedValue(new Error("agent down"));

    const result = await startProbe(
      { topicId: "t1", mode: "socratic" },
      "2026-06-24T00:00:00.000Z",
    );

    expect(recordArchetypeClassification).not.toHaveBeenCalled();
    expect(recordArchetypeUsage).not.toHaveBeenCalled();

    if (!("error" in result)) {
      expect(result.archetype).toBeNull();
    }
  });

  it("AC 27 — startProbe never passes a socraticSessionId, so continuation never applies to it", async () => {
    listGapsForTopic.mockResolvedValue([makeGap()]);
    getGapArchetypeState.mockResolvedValue(null);
    askGenerate.mockResolvedValue({
      object: { prompt: "Fresh question", options: [], correctAnswerIndex: null },
    });

    await startProbe({ topicId: "t1", mode: "socratic" }, "2026-06-24T00:00:00.000Z");

    expect(getMostRecentTurnArchetype).not.toHaveBeenCalled();
  });
});
