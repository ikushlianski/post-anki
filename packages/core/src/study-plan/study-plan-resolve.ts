import type { StudyIntent, StudyOptions, StudyOptionsOverride } from "@post-anki/shared";
import { resolveStudyOptions, type ResolvedStudyOptions } from "../subject-study-options-resolve";

export interface StudyPlanChainLink {
  subjectId: string;
  options: StudyOptionsOverride;
  studyIntent: StudyIntent | null;
  examDate: string | null;
  examPlannedAt: string | null;
}

export interface ResolvedStudyPlan {
  intent: StudyIntent;
  examDate: string | null;
  plannedAt: string | null;
  intentSource: string;
  explicitPerDay: number | null;
  desiredRetention: number;
  options: ResolvedStudyOptions;
}

export const APP_INTENT_SOURCE = "app";

export function resolveStudyPlan(
  chain: StudyPlanChainLink[],
  appDefaults: StudyOptions,
): ResolvedStudyPlan {
  const options = resolveStudyOptions(chain, appDefaults);
  const intentIndex = chain.findIndex((link) => link.studyIntent !== null);
  const intentLink = intentIndex >= 0 ? chain[intentIndex] : undefined;
  const scope = intentIndex >= 0 ? chain.slice(0, intentIndex + 1) : [];
  const explicit = scope.find((link) => link.options.newCardsPerDay != null);

  return {
    intent: intentLink?.studyIntent ?? "long_term",
    examDate: intentLink?.studyIntent === "exam" ? intentLink.examDate : null,
    plannedAt: intentLink?.studyIntent === "exam" ? intentLink.examPlannedAt : null,
    intentSource: intentLink?.subjectId ?? APP_INTENT_SOURCE,
    explicitPerDay: explicit?.options.newCardsPerDay ?? null,
    desiredRetention: options.effective.desiredRetention,
    options,
  };
}
