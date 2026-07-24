const DAY_MS = 24 * 60 * 60 * 1000;

export interface StreakState {
  lastActiveDate: string | null;
  today: string;
  currentStreak: number;
  longestStreak: number;
}

export interface StreakUpdate {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}

export function updateStreak(state: StreakState): StreakUpdate {
  const { lastActiveDate, today, currentStreak, longestStreak } = state;

  if (lastActiveDate === today) {
    return { currentStreak, longestStreak, lastActiveDate: today };
  }

  const dayGap = lastActiveDate === null ? null : daysBetween(lastActiveDate, today);
  const nextStreak = dayGap === 1 ? currentStreak + 1 : 1;

  return {
    currentStreak: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
    lastActiveDate: today,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}
