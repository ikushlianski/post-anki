import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitAnswerGrader: "knowledgeBitAnswerGrader" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitAnswerGraderPrompt,
  knowledgeBitAnswerGraderResultSchema,
  runKnowledgeBitAnswerGrader,
} from "./knowledge-bit-answer-grader.agent.js";

describe("buildKnowledgeBitAnswerGraderPrompt", () => {
  it("wraps question, reference answer, and learner answer in their own delimiters", () => {
    const prompt = buildKnowledgeBitAnswerGraderPrompt(
      "Why does anchoring shift perceived value?",
      "The first number seen recalibrates the comparison baseline.",
      "Because you compare everything to the first price you saw.",
    );

    expect(prompt).toContain("<question>");
    expect(prompt).toContain("Why does anchoring shift perceived value?");
    expect(prompt).toContain("<reference_answer>");
    expect(prompt).toContain("The first number seen recalibrates the comparison baseline.");
    expect(prompt).toContain("<learner_answer>");
    expect(prompt).toContain("Because you compare everything to the first price you saw.");
  });
});

describe("knowledgeBitAnswerGraderResultSchema", () => {
  it("accepts a valid score/verdict/feedback triple", () => {
    const result = knowledgeBitAnswerGraderResultSchema.safeParse({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning well.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a score outside 0-10", () => {
    const result = knowledgeBitAnswerGraderResultSchema.safeParse({
      score: 11,
      verdict: "Ok",
      feedback: "x",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a verdict outside the known enum", () => {
    const result = knowledgeBitAnswerGraderResultSchema.safeParse({
      score: 5,
      verdict: "Maybe",
      feedback: "x",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty feedback", () => {
    const result = knowledgeBitAnswerGraderResultSchema.safeParse({
      score: 5,
      verdict: "NeedsReview",
      feedback: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("runKnowledgeBitAnswerGrader", () => {
  it("passes the delimited prompt to the agent and returns a valid grade", async () => {
    generateMock.mockResolvedValueOnce({
      object: { score: 8, verdict: "Ok", feedback: "Good reasoning." },
    });

    const result = await runKnowledgeBitAnswerGrader(
      "Why does anchoring shift perceived value?",
      "The first number seen recalibrates the comparison baseline.",
      "Because of the first price seen.",
    );

    expect(result).toEqual({ score: 8, verdict: "Ok", feedback: "Good reasoning." });
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<question>");
    expect(prompt).toContain("<learner_answer>");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({
      object: { score: 20, verdict: "Ok", feedback: "" },
    });

    await expect(
      runKnowledgeBitAnswerGrader("Q", "Reference", "Answer"),
    ).rejects.toThrow("knowledge_bit_answer_grader_invalid_output");
  });
});
