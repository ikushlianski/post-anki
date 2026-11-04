import type { GoalStreak, Streak } from "@post-anki/shared";
import { recordQualifiedDay, viewGoalStreak, addDays, type GoalStreakState } from "@post-anki/core";
import { localDateString } from "../motivation/motivation-time.js";
import { countReviewsOnLocalDay, reviewCountsByLocalDay } from "../motivation/motivation-activity.repo.js";
import { recordGoalDay } from "../motivation/motivation-goal-days.repo.js";
import { readMotivationSettings } from "../motivation/motivation-settings.repo.js";
import { readDailyReviewTarget } from "../study-goal/study-goal-daily.repo.js";
import { readGoalStreakState, updateGoalStreakState } from "./streak.repo.js";

export type ActivityKind = "session" | "review";

const ACTIVE_WINDOW_DAYS = 30;

function toStreak(state: GoalStreakState): Streak {
  return {
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    lastActiveDate: state.lastActiveDate,
  };
}

export async function qualifyingThreshold(minReviews: number): Promise<{ threshold: number; isGoal: boolean }> {
  const target = await readDailyReviewTarget();

  return target === null ? { threshold: minReviews, isGoal: false } : { threshold: target, isGoal: true };
}

export async function recordActivityToday(now: string, kind: ActivityKind = "session"): Promise<Streak> {
  const settings = await readMotivationSettings();
  const today = localDateString(new Date(now), settings.timeZone);

  if (kind === "review") {
    const { threshold } = await qualifyingThreshold(settings.streakMinReviews);

    const reviews = await countReviewsOnLocalDay(settings.timeZone, today);

    if (reviews < threshold) {
      return toStreak(await readGoalStreakState());
    }

    await recordGoalDay(today, reviews, threshold);
  }

  const rules = { restDaysPerMonth: settings.restDaysPerMonth };
  const next = await updateGoalStreakState((state) => recordQualifiedDay(state, rules, today));

  return toStreak(next);
}

export async function getStreak(now: Date = new Date()): Promise<Streak> {
  const settings = await readMotivationSettings();
  const state = await readGoalStreakState();
  const view = viewGoalStreak(
    state,
    { restDaysPerMonth: settings.restDaysPerMonth },
    localDateString(now, settings.timeZone),
  );

  return {
    currentStreak: view.current,
    longestStreak: view.longest,
    lastActiveDate: state.lastActiveDate,
  };
}

export async function getGoalStreak(now: Date = new Date()): Promise<GoalStreak> {
  const settings = await readMotivationSettings();
  const state = await readGoalStreakState();
  const today = localDateString(now, settings.timeZone);
  const view = viewGoalStreak(state, { restDaysPerMonth: settings.restDaysPerMonth }, today);
  const counts = await reviewCountsByLocalDay(settings.timeZone, {
    start: addDays(today, -(ACTIVE_WINDOW_DAYS - 1)),
    end: addDays(today, 1),
  });

  return { ...view, activeDaysLast30: [...counts.values()].filter((total) => total > 0).length };
}

export async function pauseStreak(days: number, now: Date = new Date()): Promise<GoalStreak> {
  const settings = await readMotivationSettings();
  const today = localDateString(now, settings.timeZone);

  await updateGoalStreakState((state) => ({
    ...state,
    pausedUntil: days === 0 ? null : addDays(today, days - 1),
  }));

  return getGoalStreak(now);
}
