import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import type { ChunkCards } from "./detect-knowledge-bits-chunk.js";
import { groupFusionCards, runFusion } from "./knowledge-bit-fusion-extraction.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

function lesson(statement: string): LessonDraft {
  return {
    statement,
    quote: "quote",
    example: null,
    cards: [{ kind: "basic", statement, question: `${statement}?`, answer: "a", quote: "quote" }],
  };
}

function cards(...statements: string[]): ChunkCards {
  return { valid: statements.map(lesson), flagged: [] };
}

describe("groupFusionCards", () => {
  it("should store a card once and credit every model that wrote it", () => {
    const grouped = groupFusionCards([
      { modelId: "m1", cards: cards("Water boils at 100C") },
      { modelId: "m2", cards: cards("  water   BOILS at 100c ") },
      { modelId: "m3", cards: cards("Ice melts at 0C") },
    ]);

    expect(grouped.valid.map((item) => [item.statement, item.modelIds])).toEqual([
      ["Water boils at 100C", ["m1", "m2"]],
      ["Ice melts at 0C", ["m3"]],
    ]);
  });

  it("should keep distinct cards from different models as separate candidates", () => {
    const grouped = groupFusionCards([
      { modelId: "m1", cards: cards("First fact") },
      { modelId: "m2", cards: cards("Second fact") },
    ]);

    expect(grouped.valid.map((item) => item.modelIds)).toEqual([["m1"], ["m2"]]);
  });

  it("should credit a repeated card to a model only once", () => {
    const grouped = groupFusionCards([{ modelId: "m1", cards: cards("Same fact", "same fact") }]);

    expect(grouped.valid).toHaveLength(1);
    expect(grouped.valid[0]?.modelIds).toEqual(["m1"]);
  });

  it("should group flagged cards by model too", () => {
    const flagged = { reason: "quote_not_in_source" as const, lesson: lesson("Flagged fact") };
    const grouped = groupFusionCards([
      { modelId: "m1", cards: { valid: [], flagged: [flagged] } },
      { modelId: "m2", cards: { valid: [], flagged: [flagged] } },
    ]);

    expect(grouped.flagged).toHaveLength(1);
    expect(grouped.flagged[0]?.lesson.modelIds).toEqual(["m1", "m2"]);
  });

  it("should report nothing worth keeping only when every model said so", () => {
    const empty: ChunkCards = { valid: [], flagged: [], deliberateEmpty: true };

    expect(groupFusionCards([{ modelId: "m1", cards: empty }, { modelId: "m2", cards: empty }]).deliberateEmpty).toBe(true);
    expect(
      groupFusionCards([{ modelId: "m1", cards: empty }, { modelId: "m2", cards: cards("Fact") }]).deliberateEmpty,
    ).toBeUndefined();
  });
});

describe("runFusion", () => {
  it("should keep the other models' cards when one model fails", async () => {
    const result = await runFusion(["m1", "m2", "m3"], async (modelId) => {
      if (modelId === "m2") {
        throw new Error("provider down");
      }

      return cards(`Fact from ${modelId}`);
    });

    expect(result.valid.map((item) => item.modelIds)).toEqual([["m1"], ["m3"]]);
  });

  it("should fail the chunk like the single-model path when every model fails", async () => {
    await expect(
      runFusion(["m1", "m2"], async () => {
        throw new Error("all down");
      }),
    ).rejects.toThrow("all down");
  });

  it("should call each distinct model once and never more than five models", async () => {
    const run = vi.fn(async (_modelId: string) => cards("Fact"));

    await runFusion(["m1", "m1", "m2", "m3", "m4", "m5", "m6", "m7"], run);

    expect(run.mock.calls.map(([id]) => id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });
});
