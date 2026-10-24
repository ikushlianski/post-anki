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

vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: vi.fn().mockResolvedValue("openrouter/deepseek/deepseek-v4-flash"),
}));

import { getKnowledgeItemModelId } from "../admin-settings/admin-settings.repo.js";
import { generateWithRetry } from "./generate-with-retry.js";

import {
  buildKnowledgeBitFillBlankGeneratorPrompt,
  knowledgeBitFillBlankGeneratorResultSchema,
  runKnowledgeBitFillBlankGenerator,
  INSTRUCTIONS,
} from "./knowledge-bit-fill-blank-generator.agent.js";

describe("buildKnowledgeBitFillBlankGeneratorPrompt", () => {
  it("wraps the bit body in <bit> delimiters", () => {
    const prompt = buildKnowledgeBitFillBlankGeneratorPrompt("Anchoring biases price perception.");

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("</bit>");
    expect(prompt.indexOf("<bit>")).toBeLessThan(prompt.indexOf("Anchoring biases"));
    expect(prompt.indexOf("Anchoring biases")).toBeLessThan(prompt.indexOf("</bit>"));
  });

  it("puts the style notes block in the prompt before the bit", () => {
    const block = "<style_notes>\n- short wording\n</style_notes>";
    const prompt = buildKnowledgeBitFillBlankGeneratorPrompt("Anchoring biases price perception.", block);

    expect(prompt).toContain(block);
    expect(prompt.indexOf(block)).toBeLessThan(prompt.indexOf("<bit>"));
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

describe("runKnowledgeBitFillBlankGenerator model pinning", () => {
  it("should pass the stored knowledge-item model on requestContext and to the retry wrapper", async () => {
    vi.mocked(getKnowledgeItemModelId).mockResolvedValueOnce("openrouter/google/gemma-4-31b-it");
    generateMock.mockResolvedValueOnce({ object: { sentence: "Anchoring biases price perception.", prompt: "Anchoring biases ____ perception.", answer: "price" } });

    await runKnowledgeBitFillBlankGenerator("Anchoring biases price perception.");

    const [, options] = generateMock.mock.calls.at(-1) as [
      string,
      { requestContext: { get: (key: string) => unknown } },
    ];

    expect(options.requestContext.get("knowledgeItemModelId")).toBe("openrouter/google/gemma-4-31b-it");
    expect(vi.mocked(generateWithRetry)).toHaveBeenLastCalledWith(
      expect.any(String),
      null,
      "knowledgeBitFillBlankGenerator",
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

