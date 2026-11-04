import {
  EXAM_DATE_MAX_DAYS_AHEAD,
  type ExamDateErrorCode,
  type StudyIntent,
} from "@post-anki/shared";
import { addLocalDays } from "@post-anki/core";

export interface StoredStudyIntent {
  studyIntent: StudyIntent | null;
  examDate: string | null;
}

export interface StudyIntentPatch {
  studyIntent?: StudyIntent | null;
  examDate?: string | null;
}

export type StudyIntentPatchResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; next: StoredStudyIntent; restampPlan: boolean }
  | { ok: false; error: ExamDateErrorCode };

export function validateStudyIntentPatch(
  stored: StoredStudyIntent,
  patch: StudyIntentPatch,
  today: string,
): StudyIntentPatchResult {
  const intentChanged = patch.studyIntent !== undefined && patch.studyIntent !== stored.studyIntent;
  const dateChanged = patch.examDate !== undefined && patch.examDate !== stored.examDate;

  if (!intentChanged && !dateChanged) {
    return { ok: true, changed: false };
  }

  const studyIntent = patch.studyIntent === undefined ? stored.studyIntent : patch.studyIntent;
  const examDate = patch.examDate === undefined ? stored.examDate : patch.examDate;

  if (studyIntent !== "exam") {
    if (typeof patch.examDate === "string") {
      return { ok: false, error: "exam_date_requires_exam_intent" };
    }

    return { ok: true, changed: true, next: { studyIntent, examDate: null }, restampPlan: false };
  }

  if (examDate === null) {
    return { ok: false, error: "exam_date_required" };
  }

  if (examDate < today) {
    return { ok: false, error: "exam_date_in_past" };
  }

  if (examDate > addLocalDays(today, EXAM_DATE_MAX_DAYS_AHEAD)) {
    return { ok: false, error: "exam_date_too_far" };
  }

  return {
    ok: true,
    changed: true,
    next: { studyIntent, examDate },
    restampPlan: stored.studyIntent !== "exam" || examDate !== stored.examDate,
  };
}
