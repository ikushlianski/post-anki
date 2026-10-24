import type { Badge } from "@post-anki/shared";
import { MASTERED_INTERVAL_DAYS } from "./review-points";

export const STREAK_BADGE_THRESHOLDS = [3, 7, 30, 100] as const;
export const MASTERED_BADGE_THRESHOLDS = [1, 10, 50, 200] as const;
export const SUBJECT_DEPTH_BADGE_THRESHOLDS = [25, 100, 500] as const;
export const TOTAL_REVIEWS_BADGE_THRESHOLDS = [100, 1000, 5000] as const;

export interface SubjectReviewCount {
  subjectId: string;
  subjectName: string;
  reviews: number;
}

export interface BadgeInput {
  longestStreak: number;
  masteredCards: number;
  totalReviews: number;
  subjectReviews: SubjectReviewCount[];
}

function build(
  family: Badge["family"],
  keyPrefix: string,
  thresholds: readonly number[],
  value: number,
  describe: (threshold: number) => { name: string; description: string },
): Badge[] {
  return thresholds.map((threshold) => ({
    key: `${keyPrefix}-${threshold}`,
    family,
    ...describe(threshold),
    threshold,
    progress: Math.min(value, threshold),
    unlocked: value >= threshold,
  }));
}

function clamp(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function evaluateBadges(input: BadgeInput): Badge[] {
  const subjectBadges = input.subjectReviews.flatMap((subject) =>
    build(
      "subject_depth",
      `subject-${subject.subjectId}`,
      SUBJECT_DEPTH_BADGE_THRESHOLDS,
      clamp(subject.reviews),
      (n) => ({
        name: `${subject.subjectName}: ${n} reviews`,
        description: `Review cards in ${subject.subjectName} ${n} times.`,
      }),
    ),
  );

  return [
    ...build("streak", "streak", STREAK_BADGE_THRESHOLDS, clamp(input.longestStreak), (n) => ({
      name: `${n}-day streak`,
      description: `Study ${n} days in a row.`,
    })),
    ...build("mastered", "mastered", MASTERED_BADGE_THRESHOLDS, clamp(input.masteredCards), (n) => ({
      name: n === 1 ? "First mastered card" : `${n} mastered cards`,
      description: `Get ${n} ${n === 1 ? "card" : "cards"} to a ${MASTERED_INTERVAL_DAYS}-day review interval.`,
    })),
    ...build("total_reviews", "total-reviews", TOTAL_REVIEWS_BADGE_THRESHOLDS, clamp(input.totalReviews), (n) => ({
      name: `${n} reviews`,
      description: `Review cards ${n} times in total.`,
    })),
    ...subjectBadges,
  ];
}
