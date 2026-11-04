import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { pickAlternateVariant } from "./knowledge-bit-review-alt-variant.repo.js";

function row(variantId: string, kind = "wh_question") {
  return {
    variantId,
    knowledgeBitId: "kb_1",
    kind,
    cardKey: "",
    prompt: `prompt ${variantId}`,
    context: null,
    answer: "answer",
    sentence: null,
    background: null,
    body: null,
    reviewCount: 3,
    isAiGenerated: false,
    aiSuggestion: null,
    sourceLinks: null,
    subjectId: null,
    cardSubjectId: null,
    easeFactor: 2.5,
    intervalDays: 4,
    phase: "review",
    learningStep: 0,
    lapses: 0,
    isNew: false,
  };
}

function dbReturning(rows: ReturnType<typeof row>[]): DbExecutor {
  const chain: unknown = new Proxy(() => chain, {
    get: (_target, prop) => (prop === "then" ? (resolve: (value: unknown) => void) => resolve(rows) : chain),
    apply: () => chain,
  });

  return chain as DbExecutor;
}

const now = new Date("2026-11-04T10:00:00Z");

describe("pickAlternateVariant", () => {
  it("should return the first-ranked wording that is not the one just shown", async () => {
    const card = await pickAlternateVariant(
      "kb_1",
      "v_shown",
      now,
      dbReturning([row("v_shown"), row("v_other"), row("v_third")]),
    );

    expect(card?.variantId).toBe("v_other");
    expect(card?.cardKey).toBe("");
  });

  it("should skip the shown wording even when it is ranked first", async () => {
    const card = await pickAlternateVariant("kb_1", "v_first", now, dbReturning([row("v_first"), row("v_second")]));

    expect(card?.variantId).toBe("v_second");
  });

  it("should return null when the card has only one active wording", async () => {
    const card = await pickAlternateVariant("kb_1", "v_only", now, dbReturning([row("v_only")]));

    expect(card).toBeNull();
  });

  it("should return null when there are no active wordings", async () => {
    expect(await pickAlternateVariant("kb_1", "v_gone", now, dbReturning([]))).toBeNull();
  });

  it("should price the follow-up from the stored schedule state", async () => {
    const card = await pickAlternateVariant("kb_1", "v_a", now, dbReturning([row("v_a"), row("v_b")]));

    expect(card?.phase).toBe("review");
    expect(card?.intervalPreview.good).toBeGreaterThan(0);
  });
});
