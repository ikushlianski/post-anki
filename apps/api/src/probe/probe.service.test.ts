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

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: (id: string) => listGapsForTopic(id),
  persistGaps: vi.fn(),
  insertDiscoveredGaps: vi.fn(async () => []),
}));

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: vi.fn(async () => ({
    curriculumId: "c1",
    status: "confirmed",
    speed: "normal",
    hinting: false,
  })),
}));

vi.mock("./probe-grounding.js", () => ({
  gatherProbeGrounding: vi.fn(async () => ({ text: "", citations: [] })),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
