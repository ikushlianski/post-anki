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

vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: vi.fn().mockResolvedValue("openrouter/deepseek/deepseek-v4-flash"),
}));

import { getKnowledgeItemModelId } from "../admin-settings/admin-settings.repo.js";
import { generateWithRetry } from "./generate-with-retry.js";

import {
  buildKnowledgeBitQuestionGeneratorPrompt,
  knowledgeBitQuestionGeneratorResultSchema,
  runKnowledgeBitQuestionGenerator,
  INSTRUCTIONS,
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

describe("runKnowledgeBitQuestionGenerator model pinning", () => {
  it("should pass the stored knowledge-item model on requestContext and to the retry wrapper", async () => {
    vi.mocked(getKnowledgeItemModelId).mockResolvedValueOnce("openrouter/google/gemma-4-31b-it");
    generateMock.mockResolvedValueOnce({ object: { question: "Why does an anchor shift value?", answer: "It sets a reference point." } });

    await runKnowledgeBitQuestionGenerator("Anchoring biases price perception.");

    const [, options] = generateMock.mock.calls.at(-1) as [
      string,
      { requestContext: { get: (key: string) => unknown } },
    ];

    expect(options.requestContext.get("knowledgeItemModelId")).toBe("openrouter/google/gemma-4-31b-it");
    expect(vi.mocked(generateWithRetry)).toHaveBeenLastCalledWith(
      expect.any(String),
      null,
      "knowledgeBitQuestionGenerator",
      expect.any(Function),
      { modelId: "openrouter/google/gemma-4-31b-it" },
    );
  });
});

describe("INSTRUCTIONS language rule", () => {
  it("should tell the model to write every field in the same language as the source text", () => {
    expect(INSTRUCTIONS).toContain(
      "Write every field in the same language as the source text. Never translate, and never switch language.",
    );
  });
});

describe("INSTRUCTIONS meta-reference rule", () => {
  it("should forbid referring to the bit, source or passage as if the learner had seen it", () => {
    expect(INSTRUCTIONS).toContain(
      "Write the question and answer as plain study material about the claim itself. Never mention 'the bit', 'this item', 'the text', 'the source', 'the author' or 'the passage'. The question must make sense to someone who has never seen the source.",
    );
  });
});

