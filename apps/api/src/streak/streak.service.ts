import type { Streak } from "@post-anki/shared";
import { updateStreak } from "@post-anki/core";
import { readOrCreateStreak, writeStreak } from "./streak.repo.js";

function toDateOnly(now: string): string {
  return now.slice(0, 10);
}

export async function recordActivityToday(now: string): Promise<Streak> {
  const current = await readOrCreateStreak();
  const next = updateStreak({
    lastActiveDate: current.lastActiveDate,
    today: toDateOnly(now),
    currentStreak: current.currentStreak,
    longestStreak: current.longestStreak,
  });

  await writeStreak(next);

  return next;
}

export async function getStreak(): Promise<Streak> {
  return readOrCreateStreak();
}
