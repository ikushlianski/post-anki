import type { DailyGoal, DailyGoalProgress } from "@post-anki/shared";
import { getLocalDayWindow } from "../knowledge-bit/knowledge-bit-review.repo.js";
import { countReviewsInWindow } from "./study-goal-activity.repo.js";
import { readDailyReviewTarget, writeDailyReviewTarget } from "./study-goal-daily.repo.js";

export async function readDailyGoal(): Promise<DailyGoal> {
  return { dailyReviewTarget: await readDailyReviewTarget() };
}

export async function saveDailyGoal(goal: DailyGoal): Promise<DailyGoal> {
  await writeDailyReviewTarget(goal.dailyReviewTarget);

  return readDailyGoal();
}

export async function readDailyGoalProgress(tz: string, now: Date): Promise<DailyGoalProgress> {
  const window = await getLocalDayWindow(tz, now);
  const [target, doneToday] = await Promise.all([readDailyReviewTarget(), countReviewsInWindow(window)]);

  return { target, doneToday, dayEndsAt: window.endsAt.toISOString() };
}
