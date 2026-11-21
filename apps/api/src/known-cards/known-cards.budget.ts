import { checkFeatureBudget, type FeatureDecision } from "../llm-call-events/feature-budget.js";
import type { FeatureLedger } from "../llm-call-events/feature-ledger.repo.js";
import { log } from "../shared/log.js";
import { isKnownCardsEnabled, knownCardsBudgetSpec } from "./known-cards.config.js";
import { knownCardsLedger, recordKnownCardsSkip } from "./known-cards-ledger.repo.js";

export type KnownCardsGate = FeatureDecision | { allowed: false; reason: "disabled" };

export interface KnownCardsGateDeps {
  ledger?: FeatureLedger;
  now?: Date;
  recordSkip?: typeof recordKnownCardsSkip;
}

export async function checkKnownCardsGate(
  knowledgeSourceId: string | null,
  deps: KnownCardsGateDeps = {},
): Promise<KnownCardsGate> {
  try {
    if (!isKnownCardsEnabled()) {
      return { allowed: false, reason: "disabled" };
    }

    const decision = await checkFeatureBudget(
      knownCardsBudgetSpec(),
      deps.now,
      deps.ledger ?? knownCardsLedger,
    );

    if (!decision.allowed && (decision.reason === "cap_daily" || decision.reason === "cap_monthly")) {
      await (deps.recordSkip ?? recordKnownCardsSkip)("skipped_cap", knowledgeSourceId);
    }

    if (!decision.allowed && decision.reason === "breaker_open") {
      await (deps.recordSkip ?? recordKnownCardsSkip)("skipped_breaker", knowledgeSourceId);
    }

    return decision;
  } catch (err) {
    log.warn({ err, knowledgeSourceId }, "known_cards_gate_failed");

    return { allowed: false, reason: "error" };
  }
}
