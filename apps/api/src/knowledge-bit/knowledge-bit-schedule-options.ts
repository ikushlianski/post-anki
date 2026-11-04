import { deriveRetentionMultiplier, type ResolvedStudyPlan } from "@post-anki/core";
import type { StudyPlanClock } from "../study-plan/study-plan-today.js";
import { windowForPlan } from "../study-plan/study-plan-window.js";
import type { ScheduleOptions } from "./knowledge-bit-grade-schedule.js";
import { toStepOptions } from "./knowledge-bit-learning-steps.js";

export function toScheduleOptions(plan: ResolvedStudyPlan, clock: StudyPlanClock): ScheduleOptions {
  return {
    ...toStepOptions(plan.options.effective),
    maxIntervalDays: windowForPlan(plan, clock).maxIntervalDays,
    retentionMultiplier: deriveRetentionMultiplier(plan.desiredRetention),
  };
}
