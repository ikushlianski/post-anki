import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env.js";

const envState = vi.hoisted(() => ({
  value: { LLM_MODE: "real", LLM_DAILY_BUDGET_USD: 1, LOG_LEVEL: "silent" } as Record<string, unknown>,
}));

vi.mock("./env.js", () => ({ loadEnv: () => envState.value as unknown as Env }));

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

const store = vi.hoisted(() => ({
  totals: new Map<string, number>(),
  failReads: false,
  failWrites: false,
}));

vi.mock("./llm-daily-spend.repo.js", () => ({
  readDailySpendUsd: async (day: string) => {
    if (store.failReads) {
      throw new Error("db down");
    }

    return store.totals.get(day) ?? 0;
  },
  addDailySpendUsd: async (day: string, cost: number) => {
    if (store.failWrites) {
      throw new Error("db down");
    }

    const total = (store.totals.get(day) ?? 0) + cost;

    store.totals.set(day, total);

    return total;
  },
}));

vi.mock("./log.js", () => ({ log: { warn } }));

import {
  assertLlmBudgetAvailable,
  getLlmSpendTodayUsd,
  LlmBudgetCheckUnavailableError,
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
    store.totals.clear();
    store.failReads = false;
    store.failWrites = false;
    warn.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
    setEnv("real", 1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should refuse further LLM calls with a typed error once the daily cap is reached", async () => {
    await recordLlmSpend(1.01);

    await expect(assertLlmBudgetAvailable()).rejects.toThrow(LlmBudgetExceededError);
    await expect(assertLlmBudgetAvailable()).rejects.toThrow(/LLM_DAILY_BUDGET_USD/);
  });

  it("should keep allowing calls while spend is under the cap", async () => {
    await recordLlmSpend(0.5);

    await expect(assertLlmBudgetAvailable()).resolves.toBeUndefined();
  });

  it("should warn once at 80 percent and once at the cap", async () => {
    vi.useRealTimers();
    await recordLlmSpend(0.85);
    await recordLlmSpend(0.01);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    await recordLlmSpend(0.2);
    await recordLlmSpend(0.2);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));

    expect(warn.mock.calls.map((c) => c[1])).toEqual([
      "llm_daily_budget_80_percent",
      "llm_daily_budget_reached",
    ]);
  });

  it("should never count or refuse in mock mode even when spend is huge", async () => {
    setEnv("mock", 1);
    await recordLlmSpend(100);

    expect(await getLlmSpendTodayUsd()).toBe(0);
    await expect(assertLlmBudgetAvailable()).resolves.toBeUndefined();
  });

  it("should treat a budget of 0 as unlimited", async () => {
    setEnv("real", 0);
    await recordLlmSpend(100);

    await expect(assertLlmBudgetAvailable()).resolves.toBeUndefined();
  });

  it("should reset the counter when the UTC day rolls over", async () => {
    await recordLlmSpend(2);
    await expect(assertLlmBudgetAvailable()).rejects.toThrow(LlmBudgetExceededError);

    vi.setSystemTime(new Date("2026-10-24T00:00:01Z"));

    await expect(assertLlmBudgetAvailable()).resolves.toBeUndefined();
    expect(await getLlmSpendTodayUsd()).toBe(0);
  });

  it("should refuse a call in a fresh process when other processes already spent the cap", async () => {
    store.totals.set("2026-10-23", 1.5);
    resetLlmSpendForTests();

    await expect(assertLlmBudgetAvailable()).rejects.toThrow(LlmBudgetExceededError);
  });

  it("should add up spend recorded by separate processes into one daily total", async () => {
    await recordLlmSpend(0.6);
    resetLlmSpendForTests();
    await recordLlmSpend(0.6);

    expect(await getLlmSpendTodayUsd()).toBeCloseTo(1.2);
    await expect(assertLlmBudgetAvailable()).rejects.toThrow(LlmBudgetExceededError);
  });

  it("should refuse the paid call when the shared total cannot be read", async () => {
    store.failReads = true;

    await expect(assertLlmBudgetAvailable()).rejects.toThrow(LlmBudgetCheckUnavailableError);
  });

  it("should not fail an already paid call when the spend write fails", async () => {
    store.failWrites = true;

    await expect(recordLlmSpend(0.4)).resolves.toBeUndefined();
  });
});

describe("LLM_MODE=cheap model selection", () => {
  beforeEach(() => {
    resetLlmSpendForTests();
    store.totals.clear();
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

  it("should refuse to hand out a model once the daily cap is reached", async () => {
    setEnv("real", 1);
    await recordLlmSpend(2);

    expect(() => resolveAgentModel("openrouter/openai/gpt-4o-mini")).toThrow(LlmBudgetExceededError);
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("should tell clients how long until the daily budget resets", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-10-23T23:00:00Z"))).toBe(3600);
  });
});
