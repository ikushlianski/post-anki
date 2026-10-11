import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitBasicCardGenerator: "knowledgeBitBasicCardGenerator" },
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
  buildKnowledgeBitBasicCardGeneratorPrompt,
  knowledgeBitBasicCardGeneratorResultSchema,
  runKnowledgeBitBasicCardGenerator,
  INSTRUCTIONS,
} from "./knowledge-bit-basic-card-generator.agent.js";

describe("buildKnowledgeBitBasicCardGeneratorPrompt", () => {
  it("wraps the bit body in <bit> delimiters", () => {
    const prompt = buildKnowledgeBitBasicCardGeneratorPrompt("Anchoring biases price perception.");

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("</bit>");
    expect(prompt.indexOf("<bit>")).toBeLessThan(prompt.indexOf("Anchoring biases"));
    expect(prompt.indexOf("Anchoring biases")).toBeLessThan(prompt.indexOf("</bit>"));
  });
});

describe("knowledgeBitBasicCardGeneratorResultSchema", () => {
  it("accepts a non-empty front and back", () => {
    expect(
      knowledgeBitBasicCardGeneratorResultSchema.safeParse({ front: "What is TTL?", back: "Time to live" })
        .success,
    ).toBe(true);
  });

  it("rejects a blank front or back", () => {
    expect(knowledgeBitBasicCardGeneratorResultSchema.safeParse({ front: "", back: "a" }).success).toBe(false);
    expect(knowledgeBitBasicCardGeneratorResultSchema.safeParse({ front: "q", back: "" }).success).toBe(false);
  });
});

describe("runKnowledgeBitBasicCardGenerator", () => {
  it("passes the delimited prompt to the agent and returns the front/back pair", async () => {
    generateMock.mockResolvedValueOnce({ object: { front: "What is TTL?", back: "Time to live" } });

    const result = await runKnowledgeBitBasicCardGenerator("TTL means time to live.");

    expect(result).toEqual({ front: "What is TTL?", back: "Time to live" });

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<bit>");
    expect(prompt).toContain("TTL means time to live.");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({ object: { front: "" } });

    await expect(runKnowledgeBitBasicCardGenerator("Some bit.")).rejects.toThrow(
      "knowledge_bit_basic_card_generator_invalid_output",
    );
  });
});

describe("runKnowledgeBitBasicCardGenerator model pinning", () => {
  it("should pass the stored knowledge-item model on requestContext and to the retry wrapper", async () => {
    vi.mocked(getKnowledgeItemModelId).mockResolvedValueOnce("openrouter/google/gemma-4-31b-it");
    generateMock.mockResolvedValueOnce({ object: { front: "What does anchoring bias?", back: "Price perception" } });

    await runKnowledgeBitBasicCardGenerator("Anchoring biases price perception.");

    const [, options] = generateMock.mock.calls.at(-1) as [
      string,
      { requestContext: { get: (key: string) => unknown } },
    ];

    expect(options.requestContext.get("knowledgeItemModelId")).toBe("openrouter/google/gemma-4-31b-it");
    expect(vi.mocked(generateWithRetry)).toHaveBeenLastCalledWith(
      expect.any(String),
      null,
      "knowledgeBitBasicCardGenerator",
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

