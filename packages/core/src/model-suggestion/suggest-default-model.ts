export const MIN_MODELS_FOR_SUGGESTION = 5;
export const MIN_GRADED_RUNS_PER_MODEL = 3;
export const TIE_WINDOW = 0.1;

export const SCORE_WEIGHTS = {
  extraction: 0.4,
  card: 0.25,
  wording: 0.2,
  approval: 0.15,
} as const;

export interface ModelEvidence {
  modelId: string;
  gradedRuns: number;
  extractionAverage: number | null;
  cardAverage: number | null;
  wordingAverage: number | null;
  approved: number;
  rejected: number;
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface ModelProgress {
  modelId: string;
  gradedRuns: number;
  remainingRuns: number;
}

export type ModelSuggestionResult =
  | {
      status: "not_enough_evidence";
      modelsReady: number;
      modelsNeeded: number;
      perModelProgress: ModelProgress[];
    }
  | {
      status: "suggestion";
      modelId: string;
      score: number;
      basis: { gradedRuns: number; models: number };
    };

function approvalScore(model: ModelEvidence): number | null {
  const decided = model.approved + model.rejected;

  return decided === 0 ? null : 1 + 4 * (model.approved / decided);
}

export function scoreModel(model: ModelEvidence): number | null {
  const parts: Array<[number, number | null]> = [
    [SCORE_WEIGHTS.extraction, model.extractionAverage],
    [SCORE_WEIGHTS.card, model.cardAverage],
    [SCORE_WEIGHTS.wording, model.wordingAverage],
    [SCORE_WEIGHTS.approval, approvalScore(model)],
  ];

  let weighted = 0;
  let weights = 0;

  for (const [weight, value] of parts) {
    if (value !== null) {
      weighted += weight * value;
      weights += weight;
    }
  }

  return weights === 0 ? null : weighted / weights;
}

function price(model: ModelEvidence): number {
  return model.inputPerMillion + model.outputPerMillion;
}

export function suggestDefaultModel(models: ModelEvidence[]): ModelSuggestionResult {
  const eligible = models.filter((model) => model.gradedRuns >= MIN_GRADED_RUNS_PER_MODEL);

  if (eligible.length < MIN_MODELS_FOR_SUGGESTION) {
    return {
      status: "not_enough_evidence",
      modelsReady: eligible.length,
      modelsNeeded: MIN_MODELS_FOR_SUGGESTION,
      perModelProgress: models
        .filter((model) => model.gradedRuns > 0)
        .map((model) => ({
          modelId: model.modelId,
          gradedRuns: model.gradedRuns,
          remainingRuns: Math.max(0, MIN_GRADED_RUNS_PER_MODEL - model.gradedRuns),
        }))
        .sort((a, b) => a.remainingRuns - b.remainingRuns || a.modelId.localeCompare(b.modelId)),
    };
  }

  const scored = eligible
    .map((model) => ({ model, score: scoreModel(model) }))
    .flatMap((entry) => (entry.score === null ? [] : [{ model: entry.model, score: entry.score }]));

  const best = Math.max(...scored.map((entry) => entry.score));
  const tied = scored.filter((entry) => best - entry.score <= TIE_WINDOW);
  const winner = [...tied].sort(
    (a, b) => price(a.model) - price(b.model) || b.score - a.score || a.model.modelId.localeCompare(b.model.modelId),
  )[0]!;

  return {
    status: "suggestion",
    modelId: winner.model.modelId,
    score: Math.round(winner.score * 100) / 100,
    basis: {
      gradedRuns: eligible.reduce((sum, model) => sum + model.gradedRuns, 0),
      models: eligible.length,
    },
  };
}
