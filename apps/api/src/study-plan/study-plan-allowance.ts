import {
  deriveNewCardPace,
  deriveNewCardPause,
  type ResolvedStudyPlan,
} from "@post-anki/core";
import type { PlanDayCounts } from "./study-plan-day.repo.js";
import type { StudyPlanClock } from "./study-plan-today.js";
import { windowForPlan } from "./study-plan-window.js";

export interface SubjectDayLimit {
  perDay: number;
  paced: boolean;
  paused: boolean;
  threshold: number;
  limit: number;
}

export function deriveSubjectDayLimit(input: {
  plan: ResolvedStudyPlan;
  clock: StudyPlanClock;
  counts: PlanDayCounts;
  usedToday: number;
}): SubjectDayLimit {
  const { plan, clock, counts, usedToday } = input;
  const window = windowForPlan(plan, clock);
  const pace = deriveNewCardPace({
    window,
    explicitPerDay: plan.explicitPerDay,
    fallbackPerDay: plan.options.effective.newCardsPerDay,
    remainingAtDayStart: counts.fresh + usedToday,
    today: clock.today,
  });
  const pause = deriveNewCardPause({
    mode: window.mode,
    waitingReviews: counts.waiting,
    perDay: pace.perDay,
  });

  return {
    ...pace,
    paused: pause.paused,
    threshold: pause.threshold,
    limit: pause.paused ? 0 : pace.perDay,
  };
}
