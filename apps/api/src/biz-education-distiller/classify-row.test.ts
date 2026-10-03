import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const generateWithRetry = vi.fn(
  (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) => fn(),
);

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { bizEducationClassifier: "bizEducationClassifier" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (...args: Parameters<typeof generateWithRetry>) => generateWithRetry(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { classifyRow } = await import("./classify-row.js");

const hierarchy = [
  { topicId: "topic_1", topicTitle: "CAC", curriculumName: "Growth", subjectName: "Marketing" },
];

describe("classifyRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the matched topic id when it is a real member of the given hierarchy", async () => {
    generate.mockResolvedValue({ object: { matchedTopicId: "topic_1", suggestedPlacement: null } });

    const result = await classifyRow("CAC is customer acquisition cost.", hierarchy);

    expect(result).toEqual({ matchedTopicId: "topic_1", suggestedPlacement: null });
  });

  it("falls back to the inbox branch when the classifier hallucinates a topic id not in the hierarchy", async () => {
    generate.mockResolvedValue({
      object: { matchedTopicId: "topic_does_not_exist", suggestedPlacement: null },
    });

    const result = await classifyRow("Some note.", hierarchy);

    expect(result.matchedTopicId).toBeNull();
    expect(result.suggestedPlacement).toBeTruthy();
  });

  it("passes through a genuine unplaced classification unchanged", async () => {
    generate.mockResolvedValue({
      object: { matchedTopicId: null, suggestedPlacement: "Under Pricing" },
    });

    const result = await classifyRow("A new framework for pricing.", hierarchy);

    expect(result).toEqual({ matchedTopicId: null, suggestedPlacement: "Under Pricing" });
  });
});
