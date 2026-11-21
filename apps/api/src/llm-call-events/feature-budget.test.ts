import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { breakerStateFrom, checkFeatureBudget } = await import("./feature-budget.js");

import type { FeatureBudgetSpec } from "./feature-budget.js";
import type { FeatureCallRow, FeatureLedger, FeatureUsage } from "./feature-ledger.repo.js";

const NOW = new Date("2026-11-21T12:00:00Z");
const MINUTE = 60_000;

const spec: FeatureBudgetSpec = {
  featureKey: "demo",
  stepOp: "demo_step",
  caps: { dailyUsd: 0.1, dailyTokens: 350_000, monthlyUsd: 2, monthlyTokens: 7_000_000 },
  worstCaseUsd: 0.002,
  worstCaseTokens: 6000,
  breaker: { failureThreshold: 5, cooldownMs: 30 * MINUTE },
};

const idle: FeatureUsage = { dayCostUsd: 0, dayTokens: 0, monthCostUsd: 0, monthTokens: 0, dayUnmeteredFailures: 0, monthUnmeteredFailures: 0 };

function row(outcome: "ok" | "failed", minutesAgo: number): FeatureCallRow {
  return { outcome, createdAt: new Date(NOW.getTime() - minutesAgo * MINUTE) };
}

function ledgerOf(usage: Partial<FeatureUsage>, recent: FeatureCallRow[] = []): FeatureLedger {
  return {
    sumUsage: vi.fn().mockResolvedValue({ ...idle, ...usage }),
    listRecentSteps: vi.fn().mockResolvedValue(recent),
  };
}

const fiveFailures = (newestMinutesAgo: number): FeatureCallRow[] =>
  [0, 1, 2, 3, 4].map((i) => row("failed", newestMinutesAgo + i));

describe("checkFeatureBudget", () => {
  it("should allow extra calls while spend is far below every cap", async () => {
    expect(await checkFeatureBudget(spec, NOW, ledgerOf({}))).toEqual({ allowed: true, probe: false });
  });

  it("should stop for the day when the next worst-case note would cross the dollar cap", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ dayCostUsd: 0.099 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_daily" });
  });

  it("should stop for the day when the token cap would be crossed even if dollars are low", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ dayTokens: 345_000 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_daily" });
  });

  it("should stop for the month on the dollar cap while the day still has room", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ monthCostUsd: 1.999 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_monthly" });
  });

  it("should stop for the month on the token cap", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ monthTokens: 6_999_000 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_monthly" });
  });

  it("should read UTC day and month boundaries from the clock it is given", async () => {
    const ledger = ledgerOf({});

    await checkFeatureBudget(spec, NOW, ledger);

    expect(ledger.sumUsage).toHaveBeenCalledWith(
      "demo_",
      new Date("2026-11-21T00:00:00Z"),
      new Date("2026-11-01T00:00:00Z"),
    );
  });

  it("should block calls while five straight failures are recent", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({}, fiveFailures(5)));

    expect(decision).toEqual({ allowed: false, reason: "breaker_open" });
  });

  it("should let exactly one probe through once the cooldown has passed", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({}, fiveFailures(31)));

    expect(decision).toEqual({ allowed: true, probe: true });
  });

  it("should read the breaker from the step rows only, not from per-call rows", async () => {
    const ledger = ledgerOf({});

    await checkFeatureBudget(spec, NOW, ledger);

    expect(ledger.listRecentSteps).toHaveBeenCalledWith("demo_step", 5);
  });

  it("should count failed calls with no recorded usage at the worst-case estimate toward the daily dollar cap", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ dayUnmeteredFailures: 49 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_daily" });
  });

  it("should count failed calls toward the daily token cap", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ dayUnmeteredFailures: 57 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_daily" });
  });

  it("should count failed calls toward the monthly cap while the day still has room", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ monthUnmeteredFailures: 1000 }));

    expect(decision).toEqual({ allowed: false, reason: "cap_monthly" });
  });

  it("should stay allowed when only a few failed calls were unmetered", async () => {
    const decision = await checkFeatureBudget(spec, NOW, ledgerOf({ dayUnmeteredFailures: 3 }));

    expect(decision).toEqual({ allowed: true, probe: false });
  });

  it("should deny without throwing when the ledger cannot be read, so ingestion carries on", async () => {
    const ledger: FeatureLedger = {
      sumUsage: vi.fn().mockRejectedValue(new Error("db down")),
      listRecentSteps: vi.fn().mockResolvedValue([]),
    };

    expect(await checkFeatureBudget(spec, NOW, ledger)).toEqual({ allowed: false, reason: "error" });
  });
});

describe("breakerStateFrom", () => {
  it("should stay closed with fewer than five rows", () => {
    expect(breakerStateFrom([row("failed", 1), row("failed", 2)], spec.breaker, NOW)).toBe("closed");
  });

  it("should stay closed when any of the last five calls succeeded", () => {
    const recent = [row("failed", 1), row("failed", 2), row("ok", 3), row("failed", 4), row("failed", 5)];

    expect(breakerStateFrom(recent, spec.breaker, NOW)).toBe("closed");
  });

  it("should close again as soon as a probe succeeds", () => {
    const recent = [row("ok", 1), ...fiveFailures(32)];

    expect(breakerStateFrom(recent, spec.breaker, NOW)).toBe("closed");
  });

  it("should open again when the probe fails", () => {
    const recent = [row("failed", 1), ...fiveFailures(32)];

    expect(breakerStateFrom(recent, spec.breaker, NOW)).toBe("open");
  });
});
