import type { ProbeDifficulty } from "@post-anki/shared";

export type DifficultyCounts = Record<ProbeDifficulty, number>;

interface DifficultyWeights {
  easy: number;
  medium: number;
  hard: number;
}

function pickWeights(priorMaturity: number | null): DifficultyWeights {
  if (priorMaturity === null || priorMaturity < 25) {
    return { easy: 0.5, medium: 0.35, hard: 0.15 };
  }

  if (priorMaturity >= 80) {
    return { easy: 0.1, medium: 0.3, hard: 0.6 };
  }

  if (priorMaturity >= 50) {
    return { easy: 0.2, medium: 0.4, hard: 0.4 };
  }

  return { easy: 0.35, medium: 0.4, hard: 0.25 };
}

export function selectQuizDifficultyMix(
  priorMaturity: number | null,
  total: number,
): DifficultyCounts {
  if (total <= 0) {
    return { easy: 0, medium: 0, hard: 0 };
  }

  const weights = pickWeights(priorMaturity);
  const easy = Math.round(total * weights.easy);
  const medium = Math.round(total * weights.medium);
  const hard = Math.max(0, total - easy - medium);

  return { easy, medium, hard };
}
