import { generateKnowledgeBitBasicCards } from "./knowledge-bit-basic-card-generation.orchestrator.js";
import type { BasicCardGenerationScanCounts } from "./knowledge-bit-basic-card-generation.orchestrator.js";
import { generateKnowledgeBitFillBlanks } from "./knowledge-bit-fill-blank-generation.orchestrator.js";
import type { FillBlankGenerationScanCounts } from "./knowledge-bit-fill-blank-generation.orchestrator.js";

export interface GenerateVariantsCounts {
  basicCards: BasicCardGenerationScanCounts;
  fillBlanks: FillBlankGenerationScanCounts;
}

export async function generateKnowledgeBitVariants(
  bitId?: string,
  _subjectId?: string,
  _modelId?: string,
): Promise<GenerateVariantsCounts> {
  const scope = bitId ? { bitId, includeApproved: true } : {};
  const basicCards = await generateKnowledgeBitBasicCards(scope);
  const fillBlanks = await generateKnowledgeBitFillBlanks(scope);

  return { basicCards, fillBlanks };
}
