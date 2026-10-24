import type { PointsReason } from "@post-anki/shared";

export const POINTS_PER_REVIEW = 1;
export const MASTERED_INTERVAL_DAYS = 21;

export interface ScoreReviewResult {
  points: number;
  reason: PointsReason;
}

export function scoreReview(): ScoreReviewResult {
  return { points: POINTS_PER_REVIEW, reason: "awarded" };
}
