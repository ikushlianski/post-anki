import { checkFeatureBudget, type FeatureDecision } from "../llm-call-events/feature-budget.js";
import type { FeatureLedger } from "../llm-call-events/feature-ledger.repo.js";
import { log } from "../shared/log.js";
import { isMiningActive, miningBudgetSpec } from "./card-synthesis-mining.config.js";
import { miningLedger, recordMiningSkip, recordMiningStep } from "./card-synthesis-mining-ledger.repo.js";

export type MiningGate = FeatureDecision | { allowed: false; reason: "disabled" };

export interface MiningGateDeps {
  ledger?: FeatureLedger;
  now?: Date;
  recordSkip?: typeof recordMiningSkip;
}

export async function checkMiningGate(
  runId: string,
  clusterId: string | null,
  deps: MiningGateDeps = {},
): Promise<MiningGate> {
  try {
    if (!isMiningActive()) {
      return { allowed: false, reason: "disabled" };
    }

    const decision = await checkFeatureBudget(miningBudgetSpec(), deps.now, deps.ledger ?? miningLedger);

    if (!decision.allowed && (decision.reason === "cap_daily" || decision.reason === "cap_monthly")) {
      await (deps.recordSkip ?? recordMiningSkip)("skipped_cap", runId, clusterId);
    }

    if (!decision.allowed && decision.reason === "breaker_open") {
      await (deps.recordSkip ?? recordMiningSkip)("skipped_breaker", runId, clusterId);
    }

    return decision;
  } catch (err) {
    log.warn({ err, runId, clusterId }, "card_synthesis_mining_gate_failed");

    return { allowed: false, reason: "error" };
  }
}

export async function recordMiningClusterStep(
  outcome: "ok" | "failed",
  runId: string,
  clusterId: string,
  durationMs: number,
  err?: unknown,
): Promise<void> {
  try {
    await recordMiningStep(outcome, runId, clusterId, durationMs, err);
  } catch (writeErr) {
    log.warn({ err: writeErr, runId, clusterId }, "card_synthesis_mining_step_record_failed");
  }
}
