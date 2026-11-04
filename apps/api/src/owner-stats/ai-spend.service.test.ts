import { describe, expect, it } from "vitest";
import type { AiSpendRow } from "./ai-spend.repo.js";
import { foldAiSpend } from "./ai-spend.service.js";

const GPT5 = "openrouter/openai/gpt-5-mini";

function row(overrides: Partial<AiSpendRow>): AiSpendRow {
  return {
    date: "2026-10-01",
    agentKey: "studyChat",
    purpose: null,
    modelId: GPT5,
    calls: 1,
    priceableCalls: 1,
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
    unpricedTokens: 0,
    ...overrides,
  };
}

describe("foldAiSpend", () => {
  it("should fall back to the agent's purpose when the row has none recorded", () => {
    const result = foldAiSpend([row({ agentKey: "studyChat" }), row({ agentKey: "cardsCompiler" })], "test");

    expect(result.totals.chatUsd).toBeCloseTo(2.25);
    expect(result.totals.cardsUsd).toBeCloseTo(2.25);
    expect(result.totals.otherUsd).toBe(0);
  });

  it("should prefer the recorded purpose over the agent mapping", () => {
    const result = foldAiSpend([row({ agentKey: "studyChat", purpose: "cards" })], "test");

    expect(result.totals.cardsUsd).toBeCloseTo(2.25);
    expect(result.totals.chatUsd).toBe(0);
  });

  it("should price rows without a model through the agent default model", () => {
    const result = foldAiSpend([row({ agentKey: "articleSummary", modelId: null })], "test");

    expect(result.byModel[0]?.modelId).toBe("openrouter/deepseek/deepseek-v4-flash");
    expect(result.unpriced).toEqual({ calls: 0, tokens: 0 });
  });

  it("should report unknown models and missing token counts as unpriced instead of zero cost", () => {
    const result = foldAiSpend(
      [
        row({ modelId: "openrouter/unknown/x", calls: 2, priceableCalls: 2, promptTokens: 10, completionTokens: 5 }),
        row({ modelId: null, agentKey: "studyChat", calls: 1, priceableCalls: 1, promptTokens: 7, completionTokens: 3 }),
        row({ calls: 3, priceableCalls: 1, unpricedTokens: 40 }),
      ],
      "test",
    );

    expect(result.unpriced).toEqual({ calls: 2 + 1 + 2, tokens: 15 + 10 + 40 });
    expect(result.totals.chatUsd).toBeCloseTo(2.25);
  });

  it("should order days ascending and carry the environment label", () => {
    const result = foldAiSpend([row({ date: "2026-10-02" }), row({ date: "2026-10-01" })], "production");

    expect(result.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(result.env).toBe("production");
    expect(result.estimated).toBe(true);
  });
});
