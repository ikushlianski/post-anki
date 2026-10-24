import { evaluateBadges, playerLevel } from "@post-anki/core";
import type { GamificationProfile, ReviewPoints } from "@post-anki/shared";
import { getStreak } from "../streak/streak.service.js";
import type { Tx } from "../shared/merge-lock.js";
import {
  countMasteredCards,
  countReviews,
  countReviewsBySubject,
  sumPoints,
  sumPointsForDay,
  type ReviewPointEventRecord,
} from "./review-point-event.repo.js";

export async function reviewPointsForEventInTx(
  tx: Tx,
  event: ReviewPointEventRecord | null,
): Promise<ReviewPoints> {
  const totalPoints = await sumPoints(tx);
  const level = playerLevel(totalPoints).level;

  if (!event) {
    return { awarded: 0, reason: "not_scored", totalPoints, level, leveledUp: false };
  }

  const before = playerLevel(Math.max(0, totalPoints - event.points)).level;

  return {
    awarded: event.points,
    reason: event.reason,
    totalPoints,
    level,
    leveledUp: level > before,
  };
}

export async function getGamificationProfile(now: Date = new Date()): Promise<GamificationProfile> {
  const [totalPoints, todayPoints, masteredCards, totalReviews, subjectReviews, streak] = await Promise.all([
    sumPoints(),
    sumPointsForDay(now.toISOString().slice(0, 10)),
    countMasteredCards(),
    countReviews(),
    countReviewsBySubject(),
    getStreak(),
  ]);

  return {
    player: playerLevel(totalPoints),
    todayPoints,
    streak: { current: streak.currentStreak, longest: streak.longestStreak },
    masteredCards,
    badges: evaluateBadges({
      longestStreak: streak.longestStreak,
      masteredCards,
      totalReviews,
      subjectReviews,
    }),
  };
}
