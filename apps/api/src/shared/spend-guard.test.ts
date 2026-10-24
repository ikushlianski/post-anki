import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env.js";

const envState = vi.hoisted(() => ({
  value: { LLM_MODE: "real", LLM_DAILY_BUDGET_USD: 1, LOG_LEVEL: "silent" } as Record<string, unknown>,
}));

vi.mock("./env.js", () => ({ loadEnv: () => envState.value as unknown as Env }));

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("./log.js", () => ({ log: { warn } }));

import {
  assertLlmBudgetAvailable,
  getLlmSpendTodayUsd,
  LlmBudgetExceededError,
  recordLlmSpend,
  resetLlmSpendForTests,
  secondsUntilUtcMidnight,
} from "./spend-guard.js";
import { resolveAgentModel } from "../mastra/model.js";

function setEnv(mode: string, budget: number) {
  envState.value = { LLM_MODE: mode, LLM_DAILY_BUDGET_USD: budget, LOG_LEVEL: "silent" };
}

describe("spend guard", () => {
  beforeAll(async () => {
    await import("./log.js");
  });

  beforeEach(async () => {
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    resetLlmSpendForTests();
    warn.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
    setEnv("real", 1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should refuse further LLM calls with a typed error once the daily cap is reached", () => {
    recordLlmSpend(1.01);

    expect(() => assertLlmBudgetAvailable()).toThrow(LlmBudgetExceededError);
    expect(() => assertLlmBudgetAvailable()).toThrow(/LLM_DAILY_BUDGET_USD/);
  });

  it("should keep allowing calls while spend is under the cap", () => {
    recordLlmSpend(0.5);

    expect(() => assertLlmBudgetAvailable()).not.toThrow();
  });

  it("should warn once at 80 percent and once at the cap", async () => {
    vi.useRealTimers();
    recordLlmSpend(0.85);
    recordLlmSpend(0.01);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    recordLlmSpend(0.2);
    recordLlmSpend(0.2);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));

    expect(warn.mock.calls.map((c) => c[1])).toEqual([
      "llm_daily_budget_80_percent",
      "llm_daily_budget_reached",
    ]);
  });

  it("should never count or refuse in mock mode even when spend is huge", () => {
    setEnv("mock", 1);
    recordLlmSpend(100);

    expect(getLlmSpendTodayUsd()).toBe(0);
    expect(() => assertLlmBudgetAvailable()).not.toThrow();
  });

  it("should treat a budget of 0 as unlimited", () => {
    setEnv("real", 0);
    recordLlmSpend(100);

    expect(() => assertLlmBudgetAvailable()).not.toThrow();
  });

  it("should reset the counter when the UTC day rolls over", () => {
    recordLlmSpend(2);
    expect(() => assertLlmBudgetAvailable()).toThrow(LlmBudgetExceededError);

    vi.setSystemTime(new Date("2026-10-24T00:00:01Z"));

    expect(() => assertLlmBudgetAvailable()).not.toThrow();
    expect(getLlmSpendTodayUsd()).toBe(0);
  });
});

describe("LLM_MODE=cheap model selection", () => {
  beforeEach(() => {
    resetLlmSpendForTests();
  });

  it("should force the cheapest tier model for an agent that asked for a premium one", () => {
    setEnv("cheap", 5);

    expect(resolveAgentModel("openrouter/deepseek/deepseek-v4-pro")).toBe(
      "openrouter/deepseek/deepseek-v4-flash",
    );
  });

  it("should leave the requested model alone in real mode", () => {
    setEnv("real", 5);

    expect(resolveAgentModel("openrouter/deepseek/deepseek-v4-pro")).toBe(
      "openrouter/deepseek/deepseek-v4-pro",
    );
  });

  it("should refuse to hand out a model once the daily cap is reached", () => {
    setEnv("real", 1);
    recordLlmSpend(2);

    expect(() => resolveAgentModel("openrouter/openai/gpt-4o-mini")).toThrow(LlmBudgetExceededError);
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("should tell clients how long until the daily budget resets", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-10-23T23:00:00Z"))).toBe(3600);
  });
});
