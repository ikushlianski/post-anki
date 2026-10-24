import { suggestDefaultModel, type ModelEvidence, type ModelSuggestionResult } from "@post-anki/core";
import { KNOWLEDGE_ITEM_MODELS, resolveUsableKnowledgeItemModelId } from "@post-anki/shared";
import { loadComparisonEvidenceRows, type ComparisonEvidenceRow } from "../model-comparison/model-comparison.repo.js";
import { loadModelEvidenceRows, type ModelEvidenceRows } from "./knowledge-bit-feedback.repo.js";

function blend(a: number | null, weightA: number, b: number | null, weightB: number): number | null {
  if (a === null) {
    return b;
  }

  if (b === null) {
    return a;
  }

  return (a * weightA + b * weightB) / (weightA + weightB);
}

export function buildModelEvidence(
  rows: ModelEvidenceRows,
  today: Date = new Date(),
  comparison: readonly ComparisonEvidenceRow[] = [],
): ModelEvidence[] {
  const byModel = new Map<string, ModelEvidence>();

  function entry(modelId: string): ModelEvidence | null {
    const usable = resolveUsableKnowledgeItemModelId(modelId, today);

    if (!usable) {
      return null;
    }

    const existing = byModel.get(usable);

    if (existing) {
      return existing;
    }

    const option = KNOWLEDGE_ITEM_MODELS[usable];
    const created: ModelEvidence = {
      modelId: usable,
      gradedRuns: 0,
      extractionAverage: null,
      cardAverage: null,
      wordingAverage: null,
      approved: 0,
      rejected: 0,
      inputPerMillion: option.inputPerMillion,
      outputPerMillion: option.outputPerMillion,
    };

    byModel.set(usable, created);

    return created;
  }

  for (const row of rows.extraction) {
    const target = entry(row.modelId);

    if (target) {
      target.gradedRuns = row.gradedRuns;
      target.extractionAverage = row.extractionAverage;
    }
  }

  for (const row of rows.decisions) {
    const target = entry(row.modelId);

    if (target) {
      target.cardAverage = row.cardAverage;
      target.wordingAverage = row.wordingAverage;
      target.approved = row.approved;
      target.rejected = row.rejected;
    }
  }

  for (const row of comparison) {
    const target = entry(row.modelId);

    if (!target) {
      continue;
    }

    const appRuns = target.gradedRuns;

    target.extractionAverage = blend(target.extractionAverage, appRuns, row.extractionAverage, row.gradedRuns);
    target.cardAverage = blend(target.cardAverage, appRuns, row.cardAverage, row.gradedRuns);
    target.wordingAverage = blend(target.wordingAverage, appRuns, row.wordingAverage, row.gradedRuns);
    target.gradedRuns = appRuns + row.gradedRuns;
  }

  return [...byModel.values()];
}

export async function getModelSuggestion(): Promise<ModelSuggestionResult> {
  const [rows, comparison] = await Promise.all([loadModelEvidenceRows(), loadComparisonEvidenceRows()]);

  return suggestDefaultModel(buildModelEvidence(rows, new Date(), comparison));
}
