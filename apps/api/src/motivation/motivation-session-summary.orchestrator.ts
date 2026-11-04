import { estimateMinutes } from "@post-anki/core";
import type { SessionSummary } from "@post-anki/shared";
import { getLocalDayWindow } from "../knowledge-bit/knowledge-bit-review.repo.js";
import { countReviewsInWindow } from "../study-goal/study-goal-activity.repo.js";
import { readDailyReviewTarget } from "../study-goal/study-goal-daily.repo.js";
import { getGoalStreak } from "../streak/streak.service.js";
import {
  countDueBefore,
  countNewlySolid,
  findLongGapRecall,
  readAverageReviewMs,
} from "./motivation-activity.repo.js";
import { readMotivationSettings } from "./motivation-settings.repo.js";

const SURPRISE_MIN_GAP_DAYS = 60;
const HOUR_MS = 3_600_000;

export async function readSessionSummary(now: Date): Promise<SessionSummary> {
  const { timeZone } = await readMotivationSettings();
  const window = await getLocalDayWindow(timeZone, now);
  const tomorrow = await getLocalDayWindow(timeZone, new Date(window.endsAt.getTime() + HOUR_MS));
  const [doneToday, goalTarget, newlySolid, tomorrowDue, averageMs, streak, surprise] = await Promise.all([
    countReviewsInWindow(window),
    readDailyReviewTarget(),
    countNewlySolid(window),
    countDueBefore(tomorrow.endsAt),
    readAverageReviewMs(),
    getGoalStreak(now),
    findLongGapRecall(window, SURPRISE_MIN_GAP_DAYS),
  ]);

  return {
    doneToday,
    goalTarget,
    goalMet: goalTarget !== null && doneToday >= goalTarget,
    bonus: goalTarget === null ? 0 : Math.max(0, doneToday - goalTarget),
    newlySolid,
    tomorrowDue,
    tomorrowMinutes: estimateMinutes(tomorrowDue, averageMs),
    streak,
    surprise,
  };
}
