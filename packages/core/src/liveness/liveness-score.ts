import { LIVENESS_MAX_SCORE, LIVENESS_MIN_SCORE } from "./liveness-constants";

export function clampLivenessScore(score: number): number {
  const rounded = Math.round(score);

  if (rounded < LIVENESS_MIN_SCORE) {
    return LIVENESS_MIN_SCORE;
  }

  if (rounded > LIVENESS_MAX_SCORE) {
    return LIVENESS_MAX_SCORE;
  }

  return rounded;
}
