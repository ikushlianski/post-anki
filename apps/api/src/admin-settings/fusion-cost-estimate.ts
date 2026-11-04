import type { FusionCostEstimate, KnowledgeItemModelId } from "@post-anki/shared";
import { estimateModelComparisonCost } from "../model-comparison/model-comparison-cost.js";

export const FUSION_TYPICAL_SOURCE_CHARS = 9000;

const TYPICAL_SOURCE = "x".repeat(FUSION_TYPICAL_SOURCE_CHARS);

export function estimateFusionCostPerSource(
  modelIds: readonly KnowledgeItemModelId[],
): FusionCostEstimate {
  const estimate = estimateModelComparisonCost(TYPICAL_SOURCE, modelIds);

  return {
    perModel: modelIds.map((modelId, index) => ({
      modelId,
      estimatedCostUsd: estimate.perModel[index]?.estimatedCostUsd ?? 0,
    })),
    totalEstimatedCostUsd: estimate.totalEstimatedCostUsd,
  };
}
