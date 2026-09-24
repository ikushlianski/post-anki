import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitFillBlankGenerator: "knowledgeBitFillBlankGenerator" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitFillBlankGeneratorPrompt,
  knowledgeBitFillBlankGeneratorResultSchema,
  runKnowledgeBitFillBlankGenerator,
} from "./knowledge-bit-fill-blank-generator.agent.js";

describe("buildKnowledgeBitFillBlankGeneratorPrompt", () => {
  it("wraps the bit body in <bit> delimiters", () => {
    const prompt = buildKnowledgeBitFillBlankGeneratorPrompt("Anchoring biases price perception.");

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("</bit>");
    expect(prompt.indexOf("<bit>")).toBeLessThan(prompt.indexOf("Anchoring biases"));
    expect(prompt.indexOf("Anchoring biases")).toBeLessThan(prompt.indexOf("</bit>"));
  });
});

describe("knowledgeBitFillBlankGeneratorResultSchema", () => {
  it("accepts a non-empty sentence, prompt, and answer", () => {
    const result = knowledgeBitFillBlankGeneratorResultSchema.safeParse({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank sentence", () => {
    const result = knowledgeBitFillBlankGeneratorResultSchema.safeParse({
      sentence: "",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a blank prompt", () => {
    const result = knowledgeBitFillBlankGeneratorResultSchema.safeParse({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "",
      answer: "anchor",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a blank answer", () => {
    const result = knowledgeBitFillBlankGeneratorResultSchema.safeParse({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("runKnowledgeBitFillBlankGenerator", () => {
  it("passes the delimited prompt to the agent and returns a valid prompt/answer pair", async () => {
    generateMock.mockResolvedValueOnce({
      object: {
        sentence: "An initial price anchor shifts what feels fair later.",
        prompt: "An initial price ____ shifts what feels fair later.",
        answer: "anchor",
      },
    });

    const result = await runKnowledgeBitFillBlankGenerator("Anchoring biases price perception.");

    expect(result).toEqual({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    });
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("Anchoring biases price perception.");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({
      object: { prompt: "", answer: "" },
    });

    await expect(runKnowledgeBitFillBlankGenerator("Some bit.")).rejects.toThrow(
      "knowledge_bit_fill_blank_generator_invalid_output",
    );
  });
});
