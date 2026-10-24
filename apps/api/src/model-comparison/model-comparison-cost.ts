import {
  KNOWLEDGE_ITEM_MODELS,
  MODEL_COMPARISON_MAX_ESTIMATED_COST_USD,
  type KnowledgeItemModelId,
  type ModelComparisonEstimate,
} from "@post-anki/shared";
import { INSTRUCTIONS } from "../mastra/knowledge-bit-source-items.agent.js";
import { chunkSourceText } from "../knowledge-bit/knowledge-bit-source-chunking.js";

export const ESTIMATE_CHARS_PER_TOKEN = 2.5;
export const ESTIMATE_OUTPUT_TOKENS_PER_CHUNK = 1500;

const INSTRUCTION_CHARS = INSTRUCTIONS.length;

export function estimateModelComparisonCost(
  excerpt: string,
  modelIds: readonly KnowledgeItemModelId[],
): ModelComparisonEstimate {
  const chunks = chunkSourceText(excerpt);
  const inputChars = chunks.reduce((sum, chunk) => sum + chunk.length + INSTRUCTION_CHARS, 0);
  const inputTokens = Math.ceil(inputChars / ESTIMATE_CHARS_PER_TOKEN);
  const outputTokens = chunks.length * ESTIMATE_OUTPUT_TOKENS_PER_CHUNK;

  const perModel = modelIds.map((modelId) => {
    const model = KNOWLEDGE_ITEM_MODELS[modelId];
    const estimatedCostUsd =
      (inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion) / 1_000_000;

    return { modelId, inputTokens, outputTokens, estimatedCostUsd };
  });

  const totalEstimatedCostUsd = perModel.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);

  return {
    perModel,
    totalEstimatedCostUsd,
    chunkCount: chunks.length,
    withinCap: totalEstimatedCostUsd <= MODEL_COMPARISON_MAX_ESTIMATED_COST_USD,
  };
}
