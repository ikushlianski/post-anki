import { describe, expect, it, vi } from "vitest";
import { MODEL_COMPARISON_MAX_ESTIMATED_COST_USD } from "@post-anki/shared";
import {
  ESTIMATE_CHARS_PER_TOKEN,
  ESTIMATE_LESSONS_HANDOFF_CHARS,
  ESTIMATE_OUTPUT_TOKENS_PER_CHUNK,
  estimateModelComparisonCost,
} from "./model-comparison-cost.js";

vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({
  INSTRUCTIONS: "x".repeat(4000),
  runKnowledgeBitSourceItems: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-lessons.agent.js", () => ({
  LESSONS_INSTRUCTIONS: "y".repeat(3000),
}));

describe("estimateModelComparisonCost", () => {
  it("should price each chosen model from its own per-million rates", () => {
    const estimate = estimateModelComparisonCost("Redis хранит данные в памяти.", [
      "openrouter/openai/gpt-oss-120b",
      "openrouter/openai/gpt-5-mini",
    ]);

    const [cheap, dear] = estimate.perModel;

    expect(cheap!.estimatedCostUsd).toBeGreaterThan(0);
    expect(dear!.estimatedCostUsd).toBeGreaterThan(cheap!.estimatedCostUsd);
    expect(estimate.totalEstimatedCostUsd).toBeCloseTo(cheap!.estimatedCostUsd + dear!.estimatedCostUsd, 10);
  });

  it("should price the instructions of both extraction calls for every chunk", () => {
    const [entry] = estimateModelComparisonCost("а".repeat(100), ["openrouter/openai/gpt-oss-120b"]).perModel;
    const expectedChars = 100 + 4000 + 3000 + ESTIMATE_LESSONS_HANDOFF_CHARS;

    expect(entry!.inputTokens).toBe(Math.ceil(expectedChars / ESTIMATE_CHARS_PER_TOKEN));
    expect(entry!.outputTokens).toBe(ESTIMATE_OUTPUT_TOKENS_PER_CHUNK);
  });

  it("should count one chunk per three thousand characters of the excerpt", () => {
    const paragraph = "а".repeat(1400);
    const excerpt = [paragraph, paragraph, paragraph, paragraph].join("\n\n");

    expect(estimateModelComparisonCost(excerpt, ["openrouter/openai/gpt-oss-120b"]).chunkCount).toBe(2);
  });

  it("should flag a run whose estimated cost passes the per-run cap", () => {
    const excerpt = Array.from({ length: 2 }, () => "б".repeat(2900)).join("\n\n");
    const models = [
      "openrouter/openai/gpt-5-mini",
      "openrouter/google/gemini-3.1-flash-lite",
      "openrouter/openai/gpt-4o-mini",
      "openrouter/meta-llama/llama-3.3-70b-instruct",
      "openrouter/anthropic/claude-haiku-5.5",
      "openrouter/openai/gpt-6-luna",
    ] as const;

    const estimate = estimateModelComparisonCost(excerpt, models);

    expect(estimate.withinCap).toBe(estimate.totalEstimatedCostUsd <= MODEL_COMPARISON_MAX_ESTIMATED_COST_USD);
  });

  it("should stay within the cap for a short excerpt on one cheap model", () => {
    expect(estimateModelComparisonCost("Короткий текст.", ["openrouter/openai/gpt-oss-120b"]).withinCap).toBe(true);
  });
});
