import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitQuestionGenerator: "knowledgeBitQuestionGenerator" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitQuestionGeneratorPrompt,
  knowledgeBitQuestionGeneratorResultSchema,
  runKnowledgeBitQuestionGenerator,
} from "./knowledge-bit-question-generator.agent.js";

describe("buildKnowledgeBitQuestionGeneratorPrompt", () => {
  it("wraps the bit body in <bit> delimiters", () => {
    const prompt = buildKnowledgeBitQuestionGeneratorPrompt("Anchoring biases price perception.");

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("</bit>");
    expect(prompt.indexOf("<bit>")).toBeLessThan(prompt.indexOf("Anchoring biases"));
    expect(prompt.indexOf("Anchoring biases")).toBeLessThan(prompt.indexOf("</bit>"));
  });
});

describe("knowledgeBitQuestionGeneratorResultSchema", () => {
  it("accepts a non-empty question and answer", () => {
    const result = knowledgeBitQuestionGeneratorResultSchema.safeParse({
      question: "Why does an initial price anchor shift what feels fair later?",
      answer: "Because the first number seen sets the reference point comparisons are made against.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank question", () => {
    const result = knowledgeBitQuestionGeneratorResultSchema.safeParse({
      question: "",
      answer: "Because of X.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a blank answer", () => {
    const result = knowledgeBitQuestionGeneratorResultSchema.safeParse({
      question: "Why does this matter?",
      answer: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("runKnowledgeBitQuestionGenerator", () => {
  it("passes the delimited prompt to the agent and returns a valid question/answer pair", async () => {
    generateMock.mockResolvedValueOnce({
      object: {
        question: "Why does an initial price anchor shift what feels fair later?",
        answer: "Because the first number seen sets the reference point comparisons are made against.",
      },
    });

    const result = await runKnowledgeBitQuestionGenerator("Anchoring biases price perception.");

    expect(result).toEqual({
      question: "Why does an initial price anchor shift what feels fair later?",
      answer: "Because the first number seen sets the reference point comparisons are made against.",
    });
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("Anchoring biases price perception.");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({
      object: { question: "", answer: "" },
    });

    await expect(runKnowledgeBitQuestionGenerator("Some bit.")).rejects.toThrow(
      "knowledge_bit_question_generator_invalid_output",
    );
  });
});
