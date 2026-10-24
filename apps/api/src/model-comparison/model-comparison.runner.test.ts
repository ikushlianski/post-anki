import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceItemDraft } from "../knowledge-bit/knowledge-bit-source-item-validation.js";
import { extractForModel, runModelComparison, type ExtractChunk } from "./model-comparison.runner.js";

vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({
  INSTRUCTIONS: "x".repeat(4000),
  runKnowledgeBitSourceItems: vi.fn(),
}));

const EXCERPT = "Redis хранит данные в оперативной памяти, поэтому чтение занимает доли миллисекунды.";

const GOOD: SourceItemDraft = {
  statement: "Redis хранит данные в оперативной памяти.",
  question: "Где Redis хранит данные?",
  answer: "В оперативной памяти.",
  kind: "basic",
  quote: "Redis хранит данные в оперативной памяти",
};

describe("runModelComparison", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return one result per chosen model with its validated cards", async () => {
    const extract = vi.fn<ExtractChunk>().mockResolvedValue([GOOD]);

    const run = await runModelComparison(
      {
        excerpt: EXCERPT,
        modelIds: ["openrouter/openai/gpt-oss-120b", "openrouter/anthropic/claude-haiku-5.5"],
      },
      extract,
    );

    expect(run.results.map((result) => result.modelId)).toEqual([
      "openrouter/openai/gpt-oss-120b",
      "openrouter/anthropic/claude-haiku-5.5",
    ]);
    expect(run.results.every((result) => result.status === "ok" && result.cards.length === 1)).toBe(true);
  });

  it("should keep the other models running when one model fails", async () => {
    const extract = vi.fn<ExtractChunk>().mockImplementation(async (_chunk, modelId) => {
      if (modelId.includes("gpt-oss")) {
        throw new Error("provider timeout");
      }

      return [GOOD];
    });

    const run = await runModelComparison(
      {
        excerpt: EXCERPT,
        modelIds: ["openrouter/openai/gpt-oss-120b", "openrouter/anthropic/claude-haiku-5.5"],
      },
      extract,
    );

    expect(run.results[0]).toMatchObject({ status: "failed", error: "provider timeout", cards: [] });
    expect(run.results[1]).toMatchObject({ status: "ok" });
  });

  it("should report dropped cards instead of showing guard failures as cards", async () => {
    const bad: SourceItemDraft = { ...GOOD, quote: "такой цитаты нет в тексте вообще" };
    const extract = vi.fn<ExtractChunk>().mockResolvedValue([GOOD, bad]);

    const run = await runModelComparison(
      { excerpt: EXCERPT, modelIds: ["openrouter/openai/gpt-oss-120b"] },
      extract,
    );

    expect(run.results[0]).toMatchObject({ returned: 2 });
    expect(run.results[0]!.cards).toHaveLength(1);
    expect(run.results[0]!.dropped).toHaveLength(1);
  });

  it("should never send a model removed from the allowlist to the provider", async () => {
    const extract = vi.fn<ExtractChunk>().mockResolvedValue([GOOD]);

    const run = await runModelComparison(
      { excerpt: EXCERPT, modelIds: ["openrouter/google/gemini-2.5-flash-lite" as never] },
      extract,
    );

    expect(extract).not.toHaveBeenCalled();
    expect(run.results[0]).toMatchObject({ status: "failed", error: "model_unavailable" });
  });

  it("should stop calling the provider for later chunks once the run is aborted", async () => {
    const controller = new AbortController();
    const paragraph = "а".repeat(2800);
    const excerpt = [paragraph, paragraph, paragraph].join("\n\n");
    const extract = vi.fn<ExtractChunk>().mockImplementation(async () => {
      controller.abort();

      return [];
    });

    const result = await extractForModel(excerpt, "openrouter/openai/gpt-oss-120b", extract, controller.signal);

    expect(extract).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
  });

  it("should sum the tokens of every chunk and price them with the model's own rates", async () => {
    const paragraph = "а".repeat(2800);
    const excerpt = [paragraph, paragraph].join("\n\n");
    const extract = vi.fn<ExtractChunk>().mockImplementation(async (_chunk, _modelId, _signal, onUsage) => {
      onUsage?.({ inputTokens: 1000, outputTokens: 400 });

      return [];
    });

    const result = await extractForModel(excerpt, "openrouter/openai/gpt-oss-120b", extract);

    expect(result).toMatchObject({ status: "ok", inputTokens: 2000, outputTokens: 800 });
    expect(result.actualCostUsd).toBeCloseTo((2000 * 0.037 + 800 * 0.17) / 1_000_000, 10);
  });

  it("should report no usage at all when one chunk did not report it, instead of a partial number", async () => {
    const paragraph = "а".repeat(2800);
    const excerpt = [paragraph, paragraph].join("\n\n");
    let call = 0;
    const extract = vi.fn<ExtractChunk>().mockImplementation(async (_chunk, _modelId, _signal, onUsage) => {
      call += 1;

      if (call === 1) {
        onUsage?.({ inputTokens: 1000, outputTokens: 400 });
      }

      return [];
    });

    const result = await extractForModel(excerpt, "openrouter/openai/gpt-oss-120b", extract);

    expect(result).toMatchObject({ status: "ok", inputTokens: null, outputTokens: null, actualCostUsd: null });
  });

  it("should report no usage when the provider returned token counts as null", async () => {
    const extract = vi.fn<ExtractChunk>().mockImplementation(async (_chunk, _modelId, _signal, onUsage) => {
      onUsage?.({ inputTokens: null, outputTokens: 50 });

      return [];
    });

    const result = await extractForModel("Короткий текст.", "openrouter/openai/gpt-oss-120b", extract);

    expect(result).toMatchObject({ inputTokens: null, outputTokens: null, actualCostUsd: null });
  });

  it("should give a failed model no usage numbers", async () => {
    const extract = vi.fn<ExtractChunk>().mockRejectedValue(new Error("provider timeout"));

    const result = await extractForModel("Короткий текст.", "openrouter/openai/gpt-oss-120b", extract);

    expect(result).toMatchObject({ status: "failed", inputTokens: null, outputTokens: null, actualCostUsd: null });
  });
});
