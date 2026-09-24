import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitPlacer: "knowledgeBitPlacer" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitPlacerPrompt,
  knowledgeBitPlacerResultSchema,
  runKnowledgeBitPlacer,
} from "./knowledge-bit-placer.agent.js";

const topics = [
  { topicId: "topic_1", topicTitle: "Pricing psychology", curriculumName: "Marketing", subjectName: "Business" },
];

describe("buildKnowledgeBitPlacerPrompt", () => {
  it("wraps the bit body in <bit> delimiters and lists the given topics", () => {
    const prompt = buildKnowledgeBitPlacerPrompt("Anchoring biases price perception.", topics);

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("</bit>");
    expect(prompt.indexOf("<bit>")).toBeLessThan(prompt.indexOf("Anchoring biases"));
    expect(prompt.indexOf("Anchoring biases")).toBeLessThan(prompt.indexOf("</bit>"));
    expect(prompt).toContain("topic_1");
    expect(prompt).toContain("Pricing psychology");
  });

  it("notes when no topics exist yet", () => {
    const prompt = buildKnowledgeBitPlacerPrompt("Some bit.", []);

    expect(prompt).toContain("(no topics exist yet)");
  });
});

describe("knowledgeBitPlacerResultSchema", () => {
  it("accepts a matched topic id with no suggestion", () => {
    const result = knowledgeBitPlacerResultSchema.safeParse({
      matchedTopicId: "topic_1",
      suggestedPlacement: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a suggestion with no matched topic id", () => {
    const result = knowledgeBitPlacerResultSchema.safeParse({
      matchedTopicId: null,
      suggestedPlacement: "Under Marketing > Pricing.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects both matchedTopicId and suggestedPlacement being null", () => {
    const result = knowledgeBitPlacerResultSchema.safeParse({
      matchedTopicId: null,
      suggestedPlacement: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects both matchedTopicId and suggestedPlacement being non-null", () => {
    const result = knowledgeBitPlacerResultSchema.safeParse({
      matchedTopicId: "topic_1",
      suggestedPlacement: "Under Marketing > Pricing.",
    });

    expect(result.success).toBe(false);
  });
});

describe("runKnowledgeBitPlacer", () => {
  it("passes the delimited prompt to the agent and returns a valid match", async () => {
    generateMock.mockResolvedValueOnce({
      object: { matchedTopicId: "topic_1", suggestedPlacement: null },
    });

    const result = await runKnowledgeBitPlacer("Anchoring biases price perception.", topics);

    expect(result).toEqual({ matchedTopicId: "topic_1", suggestedPlacement: null });
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("Anchoring biases price perception.");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({
      object: { matchedTopicId: null, suggestedPlacement: null },
    });

    await expect(runKnowledgeBitPlacer("Some bit.", topics)).rejects.toThrow(
      "knowledge_bit_placer_invalid_output",
    );
  });
});
