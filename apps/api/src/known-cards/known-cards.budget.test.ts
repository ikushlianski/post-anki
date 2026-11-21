import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ KNOWN_CARDS_CONTEXT_ENABLED: process.env.KNOWN_CARDS_CONTEXT_ENABLED }),
}));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));

const { checkKnownCardsGate } = await import("./known-cards.budget.js");
const { isKnownCardsEnabled, knownCardsCaps } = await import("./known-cards.config.js");

import type { FeatureCallRow, FeatureLedger } from "../llm-call-events/feature-ledger.repo.js";

const NOW = new Date("2026-11-21T12:00:00Z");

function ledgerOf(dayCostUsd: number, recent: FeatureCallRow[] = []): FeatureLedger {
  return {
    sumUsage: vi.fn().mockResolvedValue({ dayCostUsd, dayTokens: 0, monthCostUsd: dayCostUsd, monthTokens: 0, dayUnmeteredFailures: 0, monthUnmeteredFailures: 0 }),
    listRecentSteps: vi.fn().mockResolvedValue(recent),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isKnownCardsEnabled", () => {
  it("should be on by default so the ceilings alone keep spend near zero", () => {
    expect(isKnownCardsEnabled({})).toBe(true);
  });

  it.each(["false", "0", "off", "no", " OFF "])("should turn off for %s", (value) => {
    expect(isKnownCardsEnabled({ KNOWN_CARDS_CONTEXT_ENABLED: value })).toBe(false);
  });

  it("should stay on for an unrecognised value", () => {
    expect(isKnownCardsEnabled({ KNOWN_CARDS_CONTEXT_ENABLED: "maybe" })).toBe(true);
  });
});

describe("knownCardsCaps", () => {
  it("should default to ten cents and 350k tokens a day, two dollars and 7M tokens a month", () => {
    expect(knownCardsCaps({})).toEqual({ dailyUsd: 0.1, dailyTokens: 350_000, monthlyUsd: 2, monthlyTokens: 7_000_000 });
  });

  it("should let the environment override a cap", () => {
    expect(knownCardsCaps({ KNOWN_CARDS_DAILY_BUDGET_USD: 0.5 }).dailyUsd).toBe(0.5);
  });
});

describe("checkKnownCardsGate", () => {
  it("should write no rows and read nothing when the feature is switched off", async () => {
    const ledger = ledgerOf(0);
    const recordSkip = vi.fn();
    vi.stubEnv("KNOWN_CARDS_CONTEXT_ENABLED", "off");

    const gate = await checkKnownCardsGate("src1", { ledger, now: NOW, recordSkip });

    expect(gate).toEqual({ allowed: false, reason: "disabled" });
    expect(ledger.sumUsage).not.toHaveBeenCalled();
    expect(recordSkip).not.toHaveBeenCalled();
  });

  it("should allow the step and write no skip row while budget remains", async () => {
    const recordSkip = vi.fn();

    const gate = await checkKnownCardsGate("src1", { ledger: ledgerOf(0.01), now: NOW, recordSkip });

    expect(gate).toEqual({ allowed: true, probe: false });
    expect(recordSkip).not.toHaveBeenCalled();
  });

  it("should record a skipped_cap row for the source when the day is spent", async () => {
    const recordSkip = vi.fn();

    const gate = await checkKnownCardsGate("src1", { ledger: ledgerOf(0.1), now: NOW, recordSkip });

    expect(gate).toEqual({ allowed: false, reason: "cap_daily" });
    expect(recordSkip).toHaveBeenCalledWith("skipped_cap", "src1");
  });

  it("should record a skipped_breaker row when five calls in a row failed recently", async () => {
    const recordSkip = vi.fn();
    const failures = [1, 2, 3, 4, 5].map((m): FeatureCallRow => ({
      outcome: "failed",
      createdAt: new Date(NOW.getTime() - m * 60_000),
    }));

    const gate = await checkKnownCardsGate("src1", { ledger: ledgerOf(0, failures), now: NOW, recordSkip });

    expect(gate).toEqual({ allowed: false, reason: "breaker_open" });
    expect(recordSkip).toHaveBeenCalledWith("skipped_breaker", "src1");
  });

  it("should still deny without throwing when writing the skip row fails", async () => {
    const recordSkip = vi.fn().mockRejectedValue(new Error("db down"));

    const gate = await checkKnownCardsGate("src1", { ledger: ledgerOf(0.1), now: NOW, recordSkip });

    expect(gate).toEqual({ allowed: false, reason: "error" });
  });
});
