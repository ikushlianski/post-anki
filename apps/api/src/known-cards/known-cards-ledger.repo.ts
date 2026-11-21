import { recordLlmCallEvent, type LlmCallOutcome } from "../llm-call-events/llm-call-events.repo.js";
import { featureLedger } from "../llm-call-events/feature-ledger.repo.js";
import { KNOWN_CARDS_JUDGE_AGENT_KEY, KNOWN_CARDS_OP_STEP } from "./known-cards.config.js";

export const knownCardsLedger = featureLedger;

export async function recordKnownCardsSkip(
  outcome: Extract<LlmCallOutcome, "skipped_cap" | "skipped_breaker">,
  knowledgeSourceId: string | null,
): Promise<void> {
  await recordLlmCallEvent({
    curriculumId: null,
    op: KNOWN_CARDS_OP_STEP,
    agentKey: KNOWN_CARDS_JUDGE_AGENT_KEY,
    purpose: "cards",
    knowledgeSourceId,
    outcome,
    durationMs: 0,
    success: true,
    errorMessage: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });
}
