import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitFollowupGenerator: "knowledgeBitFollowupGenerator" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitFollowupGeneratorPrompt,
  knowledgeBitFollowupGeneratorResultSchema,
  runKnowledgeBitFollowupGenerator,
} from "./knowledge-bit-followup-generator.agent.js";

describe("buildKnowledgeBitFollowupGeneratorPrompt", () => {
  it("wraps kind, question, reference answer, learner answer, verdict, and feedback in their own delimiters", () => {
    const prompt = buildKnowledgeBitFollowupGeneratorPrompt(
      "wh_question",
      "Why does anchoring shift perceived value?",
      "The first number seen recalibrates the comparison baseline.",
      "Because of the first price seen.",
      "Ok",
      "Captures the reasoning well.",
    );

    expect(prompt).toContain("<kind>\nwh_question\n</kind>");
    expect(prompt).toContain("<question>");
    expect(prompt).toContain("Why does anchoring shift perceived value?");
    expect(prompt).toContain("<reference_answer>");
    expect(prompt).toContain("The first number seen recalibrates the comparison baseline.");
    expect(prompt).toContain("<learner_answer>");
    expect(prompt).toContain("Because of the first price seen.");
    expect(prompt).toContain("<verdict>\nOk\n</verdict>");
    expect(prompt).toContain("<feedback>");
    expect(prompt).toContain("Captures the reasoning well.");
  });

  it("carries fill_in_the_blank through as the kind, not defaulting to wh_question", () => {
    const prompt = buildKnowledgeBitFollowupGeneratorPrompt(
      "fill_in_the_blank",
      "An initial price ____ shifts what feels fair later.",
      "anchor",
      "anchor",
      "Ok",
      "Exact term.",
    );

    expect(prompt).toContain("<kind>\nfill_in_the_blank\n</kind>");
  });
});

describe("knowledgeBitFollowupGeneratorResultSchema", () => {
  it("accepts a non-empty followUpQuestion", () => {
    const result = knowledgeBitFollowupGeneratorResultSchema.safeParse({
      followUpQuestion: "What would happen if the first price seen were much lower?",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty followUpQuestion", () => {
    const result = knowledgeBitFollowupGeneratorResultSchema.safeParse({ followUpQuestion: "" });

    expect(result.success).toBe(false);
  });
});

describe("runKnowledgeBitFollowupGenerator", () => {
  it("passes the delimited prompt to the agent and returns the follow-up question", async () => {
    generateMock.mockResolvedValueOnce({
      object: { followUpQuestion: "What if the anchor price were revealed as fake?" },
    });

    const result = await runKnowledgeBitFollowupGenerator(
      "wh_question",
      "Why does anchoring shift perceived value?",
      "The first number seen recalibrates the comparison baseline.",
      "Because of the first price seen.",
      "Ok",
      "Captures the reasoning well.",
    );

    expect(result).toEqual({ followUpQuestion: "What if the anchor price were revealed as fake?" });
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<kind>");
    expect(prompt).toContain("<verdict>");
    expect(prompt).toContain("<feedback>");
  });

  it("passes the fill_in_the_blank kind through to the prompt, not defaulting to wh_question", async () => {
    generateMock.mockResolvedValueOnce({
      object: { followUpQuestion: "Why does an anchor shift what feels fair?" },
    });

    await runKnowledgeBitFollowupGenerator(
      "fill_in_the_blank",
      "An initial price ____ shifts what feels fair later.",
      "anchor",
      "anchor",
      "Ok",
      "Exact term.",
    );

    const [prompt] = generateMock.mock.calls.at(-1) as [string, unknown];

    expect(prompt).toContain("<kind>\nfill_in_the_blank\n</kind>");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({ object: { followUpQuestion: "" } });

    await expect(
      runKnowledgeBitFollowupGenerator(
        "wh_question",
        "Q",
        "Reference",
        "Answer",
        "NeedsDeepDive",
        "Missed it.",
      ),
    ).rejects.toThrow("knowledge_bit_followup_generator_invalid_output");
  });
});
