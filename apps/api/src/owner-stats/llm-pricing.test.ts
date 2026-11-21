import { KNOWLEDGE_ITEM_MODELS } from "@post-anki/shared";
import { describe, expect, it } from "vitest";
import { PRICE_HISTORY, computeCallCostUsd, costUsd, priceFor, resolveModelId } from "./llm-pricing.js";

describe("priceFor", () => {
  it("should reuse the shared model catalogue price so the settings screen and spend agree", () => {
    const model = KNOWLEDGE_ITEM_MODELS["openrouter/openai/gpt-5-mini"];

    expect(priceFor(model.id, new Date("2026-10-01T00:00:00Z"))).toEqual({
      inputPerMillion: model.inputPerMillion,
      outputPerMillion: model.outputPerMillion,
    });
  });

  it("should return null for a model with no known price instead of guessing", () => {
    expect(priceFor("openrouter/unknown/model", new Date())).toBeNull();
  });

  it("should price a call with the rate that was in force on that day", () => {
    PRICE_HISTORY["test/model"] = [
      { effectiveFrom: "2026-01-01", in: 1, out: 2 },
      { effectiveFrom: "2026-06-01", in: 3, out: 4 },
    ];

    expect(priceFor("test/model", new Date("2026-03-01T00:00:00Z"))).toEqual({ inputPerMillion: 1, outputPerMillion: 2 });
    expect(priceFor("test/model", new Date("2026-07-01T00:00:00Z"))).toEqual({ inputPerMillion: 3, outputPerMillion: 4 });
    expect(priceFor("test/model", new Date("2025-01-01T00:00:00Z"))).toBeNull();

    delete PRICE_HISTORY["test/model"];
  });
});

describe("costUsd", () => {
  it("should charge input and output tokens at their own rates", () => {
    expect(costUsd({ inputPerMillion: 0.1, outputPerMillion: 0.5 }, 1_000_000, 2_000_000)).toBeCloseTo(1.1);
  });
});

describe("resolveModelId", () => {
  it("should prefer the recorded model and fall back to the agent default", () => {
    expect(resolveModelId("m", "articleSummary")).toBe("m");
    expect(resolveModelId(null, "articleSummary")).toBe("openrouter/deepseek/deepseek-v4-flash");
    expect(resolveModelId(null, "studyChat")).toBeNull();
  });
});

describe("computeCallCostUsd", () => {
  it("should price embedding input at the listed embedding rate", () => {
    expect(computeCallCostUsd("openai/text-embedding-3-small", 1_000_000, 0)).toBeCloseTo(0.02, 8);
  });

  it("should price the known-cards judge model through its default model id", () => {
    expect(resolveModelId(null, "knownCardsJudge")).toBe("openrouter/deepseek/deepseek-v4-flash");
    expect(computeCallCostUsd("openrouter/deepseek/deepseek-v4-flash", 1200, 300)).toBeCloseTo(0.00045, 8);
  });

  it("should return null when the model or the token counts are unknown", () => {
    expect(computeCallCostUsd(null, 10, 10)).toBeNull();
    expect(computeCallCostUsd("unknown/model", 10, 10)).toBeNull();
    expect(computeCallCostUsd("openai/text-embedding-3-small", null, null)).toBeNull();
  });
});
