import { addDays } from "@post-anki/core";
import { currentPeriodKey, periodLocalRange, type WeeklySummary } from "@post-anki/shared";
import { getRangeWindow } from "../study-goal/study-goal-activity.repo.js";
import { listCurrentPriorities } from "../study-goal/subject-priority.orchestrator.js";
import { listPrioritiesForPeriod } from "../study-goal/subject-priority.repo.js";
import { qualifyingThreshold } from "../streak/streak.service.js";
import { countNewlySolid, reviewCountsByLocalDay } from "./motivation-activity.repo.js";
import { readMotivationSettings } from "./motivation-settings.repo.js";

export async function readWeeklySummary(now: Date): Promise<WeeklySummary> {
  const settings = await readMotivationSettings();
  const tz = settings.timeZone;
  const week = periodLocalRange("week", currentPeriodKey("week", now, tz));
  const lastWeek = { start: addDays(week.start, -7), end: week.start };
  const nextWeekKey = currentPeriodKey("week", new Date(now.getTime() + 7 * 86_400_000), tz);
  const [{ threshold }, thisCounts, lastCounts, solid, focus, nextWeek] = await Promise.all([
    qualifyingThreshold(settings.streakMinReviews),
    reviewCountsByLocalDay(tz, week),
    reviewCountsByLocalDay(tz, lastWeek),
    getRangeWindow(tz, week).then(countNewlySolid),
    listCurrentPriorities("week", tz, now),
    listPrioritiesForPeriod("week", nextWeekKey),
  ]);
  const counts = [...thisCounts.values()];

  return {
    weekStart: week.start,
    weekEnd: addDays(week.end, -1),
    goalDays: counts.filter((total) => total >= threshold).length,
    activeDays: counts.filter((total) => total > 0).length,
    reviews: counts.reduce((sum, total) => sum + total, 0),
    reviewsLastWeek: [...lastCounts.values()].reduce((sum, total) => sum + total, 0),
    newlySolid: solid,
    focusMet: focus.priorities.filter((priority) => priority.targetMet).length,
    focusTotal: focus.priorities.length,
    nextWeekKey,
    needsNextWeekPriorities: nextWeek.length === 0,
  };
}
