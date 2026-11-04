import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateItemsForSource, type GenerateItemsDeps } from "./detect-knowledge-bits.orchestrator.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";
import { RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

const MODELS = ["openrouter/openai/gpt-6-luna", "openrouter/anthropic/claude-haiku-5.5"];
const QUOTE = "нам не обязательно искать боли клиента";

function draft(statement: string): LessonDraft {
  return {
    statement,
    quote: QUOTE,
    example: null,
    cards: [{ kind: "basic", statement, question: `${statement}?`, answer: "Ответ на вопрос", quote: QUOTE }],
  };
}

function source(extractionModelId: string | null = null): PendingKnowledgeSource {
  return { id: "ks_1", rawText: RU_SOURCE_TEXT, extractionModelId, subjectId: null, claimedAt: new Date(1) };
}

function buildDeps(overrides: Partial<GenerateItemsDeps> = {}): GenerateItemsDeps {
  return {
    writeItems: vi.fn(async () => [draft("Покупку софта запускает видение будущего клиента")]),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markItemCapReached: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

describe("generateItemsForSource with fusion", () => {
  it("should run once per chosen model and store identical cards once credited to both", async () => {
    const deps = buildDeps({ loadFusionModelIds: vi.fn().mockResolvedValue(MODELS) });

    const result = await generateItemsForSource(source(), {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.writeItems).mock.calls.map(([, options]) => options.modelId).sort()).toEqual([...MODELS].sort());
    expect(deps.insertItems).toHaveBeenCalledTimes(1);

    const stored = vi.mocked(deps.insertItems).mock.calls[0]![0].items;

    expect(stored).toHaveLength(1);
    expect(stored[0]?.modelIds).toEqual(MODELS);
    expect(result.status).toBe("detected");
  });

  it("should still save the other model's cards when one model fails", async () => {
    const deps = buildDeps({
      loadFusionModelIds: vi.fn().mockResolvedValue(MODELS),
      writeItems: vi.fn(async (_chunk, options) => {
        if (options.modelId === MODELS[0]) {
          throw new Error("provider down");
        }

        return [draft("Покупку софта запускает видение будущего клиента")];
      }),
    });

    const result = await generateItemsForSource(source(), {}, deps);

    expect(result.status).toBe("detected");
    expect(vi.mocked(deps.insertItems).mock.calls[0]![0].items[0]?.modelIds).toEqual([MODELS[1]]);
  });

  it("should fail the source like the single-model path when every model fails", async () => {
    const deps = buildDeps({
      loadFusionModelIds: vi.fn().mockResolvedValue(MODELS),
      writeItems: vi.fn().mockRejectedValue(new Error("all down")),
    });

    const result = await generateItemsForSource(source(), {}, deps);

    expect(result.status).toBe("failed");
    expect(deps.markFailed).toHaveBeenCalled();
  });

  it("should leave extraction unchanged when fusion is off: one call, no model credits", async () => {
    const deps = buildDeps({ loadFusionModelIds: vi.fn().mockResolvedValue([]) });

    await generateItemsForSource(source(), {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.writeItems).mock.calls[0]![1]).not.toHaveProperty("fusionModelIds");
    expect(vi.mocked(deps.insertItems).mock.calls[0]![0].items[0]).not.toHaveProperty("modelIds");
  });

  it("should respect a model the owner picked for the source even when fusion is on", async () => {
    const deps = buildDeps({ loadFusionModelIds: vi.fn().mockResolvedValue(MODELS) });

    await generateItemsForSource(source(MODELS[0]), {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(1);
  });

  it("should extract with a single model when the fusion settings cannot be read", async () => {
    const deps = buildDeps({ loadFusionModelIds: vi.fn().mockRejectedValue(new Error("db down")) });

    const result = await generateItemsForSource(source(), {}, deps);

    expect(deps.writeItems).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("detected");
  });
});
