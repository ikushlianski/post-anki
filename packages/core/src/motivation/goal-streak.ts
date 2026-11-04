const DAY_MS = 24 * 60 * 60 * 1000;
const REST_WINDOW_DAYS = 30;
const REST_HISTORY_DAYS = 60;

export interface GoalStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  restDates: string[];
  pausedUntil: string | null;
  lastBrokenStreak: number;
}

export interface GoalStreakRules {
  restDaysPerMonth: number;
}

export type GoalStreakStatus = "none" | "done_today" | "active" | "resting" | "paused" | "broken";

export interface GoalStreakView {
  status: GoalStreakStatus;
  current: number;
  longest: number;
  restDaysLeft: number;
  pausedUntil: string | null;
  comeback: boolean;
  previousStreak: number;
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

function missedDates(lastActiveDate: string, today: string): string[] {
  const gap = daysBetween(lastActiveDate, today);

  return Array.from({ length: Math.max(0, gap - 1) }, (_, index) => addDays(lastActiveDate, index + 1));
}

export function restDaysLeft(state: GoalStreakState, rules: GoalStreakRules, today: string): number {
  const windowStart = addDays(today, -REST_WINDOW_DAYS);
  const used = state.restDates.filter((date) => date > windowStart).length;

  return Math.max(0, rules.restDaysPerMonth - used);
}

function restNeeded(state: GoalStreakState, today: string): string[] {
  if (state.lastActiveDate === null) {
    return [];
  }

  return missedDates(state.lastActiveDate, today).filter(
    (date) => state.pausedUntil === null || date > state.pausedUntil,
  );
}

function isCovered(state: GoalStreakState, rules: GoalStreakRules, today: string): boolean {
  return restNeeded(state, today).length <= restDaysLeft(state, rules, today);
}

export function recordQualifiedDay(
  state: GoalStreakState,
  rules: GoalStreakRules,
  today: string,
): GoalStreakState {
  if (state.lastActiveDate === today) {
    return state;
  }

  const historyStart = addDays(today, -REST_HISTORY_DAYS);

  if (state.lastActiveDate === null) {
    return { ...state, currentStreak: 1, longestStreak: Math.max(state.longestStreak, 1), lastActiveDate: today };
  }

  const gap = daysBetween(state.lastActiveDate, today);

  if (gap < 1) {
    return state;
  }

  if (gap === 1 || isCovered(state, rules, today)) {
    const next = state.currentStreak + 1;
    const restDates = [...state.restDates, ...restNeeded(state, today)].filter((date) => date > historyStart);

    return {
      ...state,
      currentStreak: next,
      longestStreak: Math.max(state.longestStreak, next),
      lastActiveDate: today,
      restDates,
    };
  }

  return {
    ...state,
    currentStreak: 1,
    longestStreak: Math.max(state.longestStreak, 1),
    lastActiveDate: today,
    lastBrokenStreak: state.currentStreak,
    restDates: state.restDates.filter((date) => date > historyStart),
  };
}

export function viewGoalStreak(state: GoalStreakState, rules: GoalStreakRules, today: string): GoalStreakView {
  const left = restDaysLeft(state, rules, today);
  const base = { longest: state.longestStreak, restDaysLeft: left, pausedUntil: state.pausedUntil };

  if (state.lastActiveDate === null) {
    return { ...base, status: "none", current: 0, comeback: false, previousStreak: state.lastBrokenStreak };
  }

  if (state.lastActiveDate === today) {
    return { ...base, status: "done_today", current: state.currentStreak, comeback: false, previousStreak: state.lastBrokenStreak };
  }

  const gap = daysBetween(state.lastActiveDate, today);

  if (gap === 1) {
    return { ...base, status: "active", current: state.currentStreak, comeback: false, previousStreak: state.lastBrokenStreak };
  }

  if (!isCovered(state, rules, today)) {
    return { ...base, status: "broken", current: 0, comeback: state.currentStreak > 0, previousStreak: state.currentStreak };
  }

  const covered = state.pausedUntil !== null && state.pausedUntil >= addDays(today, -1);

  return {
    ...base,
    status: covered ? "paused" : "resting",
    current: state.currentStreak,
    comeback: false,
    previousStreak: state.lastBrokenStreak,
  };
}
