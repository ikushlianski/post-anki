import { markBitsExamined } from "./card-synthesis-mining-ledger.repo.js";
import { MINING_MAX_EVIDENCE_CARDS } from "./card-synthesis-mining.prompt.js";
import type { MiningCluster } from "./card-synthesis-mining.clustering.js";

export const FINAL_CLUSTER_OUTCOMES = [
  "synthesized",
  "not_chain",
  "duplicate_existing",
  "rejected_ungrounded",
  "failed",
] as const;

export type FinalClusterOutcome = (typeof FINAL_CLUSTER_OUTCOMES)[number];

export function isFinalClusterOutcome(outcome: string): outcome is FinalClusterOutcome {
  return (FINAL_CLUSTER_OUTCOMES as readonly string[]).includes(outcome);
}

export function clusterShownIds(cluster: MiningCluster): string[] {
  return cluster.bitIds.slice(0, MINING_MAX_EVIDENCE_CARDS);
}

export async function markUnclusteredExamined(
  runId: string,
  unclusteredBitIds: string[],
): Promise<number> {
  return markBitsExamined(unclusteredBitIds, runId, null, "singleton");
}

export async function markClusterExamined(
  runId: string,
  clusterId: string,
  cluster: MiningCluster,
  outcome: string,
): Promise<number> {
  if (!isFinalClusterOutcome(outcome)) {
    return 0;
  }

  return markBitsExamined(clusterShownIds(cluster), runId, clusterId, outcome);
}
