import { newId } from "../shared/id.js";
import { getDb } from "../db/client.js";
import { synthesisMiningClusters, synthesisMiningExaminedBits } from "../db/schema.js";
import { featureLedger } from "../llm-call-events/feature-ledger.repo.js";
import { recordLlmCallEvent, type LlmCallOutcome } from "../llm-call-events/llm-call-events.repo.js";
import { MINING_AGENT_KEY, MINING_OP_STEP } from "./card-synthesis-mining.config.js";

export const miningLedger = featureLedger;

export interface MiningClusterInput {
  id: string;
  runId: string;
  subjectId: string;
  bitIds: string[];
  evidenceBitIds: string[];
  evidenceLink: { bitId: string; snippet: string }[] | null;
  outcome: string;
  sourceId: string | null;
}

export async function recordMiningStep(
  outcome: "ok" | "failed",
  runId: string,
  clusterId: string,
  durationMs: number,
  err?: unknown,
): Promise<void> {
  await recordLlmCallEvent({
    curriculumId: null,
    op: MINING_OP_STEP,
    agentKey: MINING_AGENT_KEY,
    purpose: "cards",
    outcome,
    runId,
    clusterId,
    durationMs,
    success: outcome === "ok",
    errorMessage: outcome === "ok" ? null : err instanceof Error ? err.message : String(err),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });
}

export async function recordMiningSkip(
  outcome: Extract<LlmCallOutcome, "skipped_cap" | "skipped_breaker">,
  runId: string,
  clusterId: string | null,
): Promise<void> {
  await recordLlmCallEvent({
    curriculumId: null,
    op: MINING_OP_STEP,
    agentKey: MINING_AGENT_KEY,
    purpose: "cards",
    outcome,
    runId,
    clusterId,
    durationMs: 0,
    success: true,
    errorMessage: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });
}

export async function markBitsExamined(
  bitIds: string[],
  runId: string,
  clusterId: string | null,
  outcome: string,
): Promise<number> {
  if (bitIds.length === 0) {
    return 0;
  }

  const inserted = await getDb()
    .insert(synthesisMiningExaminedBits)
    .values(bitIds.map((bitId) => ({ id: newId("sme"), bitId, runId, clusterId, outcome })))
    .onConflictDoNothing({ target: synthesisMiningExaminedBits.bitId })
    .returning({ id: synthesisMiningExaminedBits.id });

  return inserted.length;
}

export async function insertMiningCluster(input: MiningClusterInput): Promise<void> {
  await getDb().insert(synthesisMiningClusters).values(input);
}
