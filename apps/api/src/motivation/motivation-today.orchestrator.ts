import type { MotivationSettings, TodayView } from "@post-anki/shared";
import { getGoalStreak, qualifyingThreshold } from "../streak/streak.service.js";
import { countReviewsOnLocalDay } from "./motivation-activity.repo.js";
import { readMotivationSettings } from "./motivation-settings.repo.js";
import { localDateString } from "./motivation-time.js";

export async function readTodayView(now: Date): Promise<TodayView> {
  const settings = await readMotivationSettings();
  const date = localDateString(now, settings.timeZone);
  const [{ threshold, isGoal }, reviewsDone, streak] = await Promise.all([
    qualifyingThreshold(settings.streakMinReviews),
    countReviewsOnLocalDay(settings.timeZone, date),
    getGoalStreak(now),
  ]);

  return {
    date,
    reviewsDone,
    threshold,
    thresholdIsGoal: isGoal,
    dayQualified: reviewsDone >= threshold,
    streak,
  };
}

export async function readSettings(): Promise<MotivationSettings> {
  return readMotivationSettings();
}
