import { deriveExamWindow, type ExamWindow, type ResolvedStudyPlan } from "@post-anki/core";
import { formatLocalDate, type StudyPlanClock } from "./study-plan-today.js";

export function windowForPlan(plan: ResolvedStudyPlan, clock: StudyPlanClock): ExamWindow {
  return deriveExamWindow({
    intent: plan.intent,
    examDate: plan.examDate,
    plannedOn: plan.plannedAt ? formatLocalDate(new Date(plan.plannedAt), clock.timeZone) : null,
    today: clock.today,
  });
}
