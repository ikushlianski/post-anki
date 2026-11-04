import type { Badge } from "@post-anki/shared";
import { MASTERED_INTERVAL_DAYS } from "./review-points";

export const STREAK_BADGE_THRESHOLDS = [3, 7, 30, 100] as const;
export const MASTERED_BADGE_THRESHOLDS = [1, 10, 50, 200] as const;
export const SUBJECT_DEPTH_BADGE_THRESHOLDS = [25, 100, 500] as const;
export const TOTAL_REVIEWS_BADGE_THRESHOLDS = [100, 1000, 5000] as const;
export const GOAL_DAYS_BADGE_THRESHOLDS = [7, 20, 60, 150] as const;
export const SUBJECT_SOLID_BADGE_THRESHOLDS = [50, 100] as const;
export const SUBJECT_SOLID_MIN_CARDS = 10;

export interface SubjectReviewCount {
  subjectId: string;
  subjectName: string;
  reviews: number;
}

export interface SubjectSolidShare {
  subjectId: string;
  subjectName: string;
  totalCards: number;
  percent: number;
}

export interface BadgeInput {
  longestStreak: number;
  masteredCards: number;
  totalReviews: number;
  subjectReviews: SubjectReviewCount[];
  goalDays?: number;
  subjectSolid?: SubjectSolidShare[];
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

  const solidBadges = (input.subjectSolid ?? [])
    .filter((subject) => subject.totalCards >= SUBJECT_SOLID_MIN_CARDS)
    .flatMap((subject) =>
      build(
        "subject_solid",
        `subject-solid-${subject.subjectId}`,
        SUBJECT_SOLID_BADGE_THRESHOLDS,
        clamp(subject.percent),
        (n) => ({
          name: `${subject.subjectName}: ${n}% solid`,
          description: `Make ${n}% of the cards in ${subject.subjectName} solid.`,
        }),
      ),
    );

  return [
    ...build("goal_days", "goal-days", GOAL_DAYS_BADGE_THRESHOLDS, clamp(input.goalDays ?? 0), (n) => ({
      name: `Goal met ${n} days`,
      description: `Meet your daily goal on ${n} different days. Missed days never take this away.`,
    })),
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
    ...solidBadges,
    ...subjectBadges,
  ];
}
