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

import {
  buildKnowledgeBitBasicCardGeneratorPrompt,
  knowledgeBitBasicCardGeneratorResultSchema,
  runKnowledgeBitBasicCardGenerator,
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
