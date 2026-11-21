import { log } from "../shared/log.js";
import { featureLedger, type FeatureCallRow, type FeatureLedger } from "./feature-ledger.repo.js";

export interface FeatureCaps {
  dailyUsd: number;
  dailyTokens: number;
  monthlyUsd: number;
  monthlyTokens: number;
}

export interface FeatureBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface FeatureBudgetSpec {
  featureKey: string;
  stepOp: string;
  caps: FeatureCaps;
  worstCaseUsd: number;
  worstCaseTokens: number;
  breaker: FeatureBreakerConfig;
}

export type FeatureDenyReason = "cap_daily" | "cap_monthly" | "breaker_open" | "error";

export type FeatureDecision =
  | { allowed: true; probe: boolean }
  | { allowed: false; reason: FeatureDenyReason };

export type BreakerState = "closed" | "open" | "half_open";

export function opPrefixFor(featureKey: string): string {
  return `${featureKey}_`;
}

export function breakerStateFrom(
  recent: FeatureCallRow[],
  config: FeatureBreakerConfig,
  now: Date,
): BreakerState {
  const lastFailures = recent.slice(0, config.failureThreshold);

  if (
    lastFailures.length < config.failureThreshold ||
    lastFailures.some((row) => row.outcome !== "failed")
  ) {
    return "closed";
  }

  const newest = lastFailures[0]!.createdAt.getTime();

  return now.getTime() - newest < config.cooldownMs ? "open" : "half_open";
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkFeatureBudget(
  spec: FeatureBudgetSpec,
  now: Date = new Date(),
  ledger: FeatureLedger = featureLedger,
): Promise<FeatureDecision> {
  try {
    const prefix = opPrefixFor(spec.featureKey);
    const [usage, recent] = await Promise.all([
      ledger.sumUsage(prefix, startOfUtcDay(now), startOfUtcMonth(now)),
      ledger.listRecentSteps(spec.stepOp, spec.breaker.failureThreshold),
    ]);
    const { caps } = spec;
    const dayCost = usage.dayCostUsd + usage.dayUnmeteredFailures * spec.worstCaseUsd;
    const dayTokens = usage.dayTokens + usage.dayUnmeteredFailures * spec.worstCaseTokens;
    const monthCost = usage.monthCostUsd + usage.monthUnmeteredFailures * spec.worstCaseUsd;
    const monthTokens = usage.monthTokens + usage.monthUnmeteredFailures * spec.worstCaseTokens;

    if (
      dayCost + spec.worstCaseUsd >= caps.dailyUsd ||
      dayTokens + spec.worstCaseTokens >= caps.dailyTokens
    ) {
      return { allowed: false, reason: "cap_daily" };
    }

    if (
      monthCost + spec.worstCaseUsd >= caps.monthlyUsd ||
      monthTokens + spec.worstCaseTokens >= caps.monthlyTokens
    ) {
      return { allowed: false, reason: "cap_monthly" };
    }

    const breaker = breakerStateFrom(recent, spec.breaker, now);

    if (breaker === "open") {
      return { allowed: false, reason: "breaker_open" };
    }

    return { allowed: true, probe: breaker === "half_open" };
  } catch (err) {
    log.warn({ err, featureKey: spec.featureKey }, "feature_budget_check_failed");

    return { allowed: false, reason: "error" };
  }
}
