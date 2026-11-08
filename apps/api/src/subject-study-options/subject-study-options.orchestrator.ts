import type {
  ExamDateErrorCode,
  SubjectStudyOptions,
  UpdateSubjectStudyOptionsInput,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { readStudyPlanToday } from "../study-plan/study-plan-today.js";
import { validateStudyIntentPatch } from "./study-intent-patch.js";
import { loadStudyOptionsResolver } from "./subject-study-options-resolver.js";
import { listSubjectStudyOptionRows, writeSubjectStudyOptions } from "./subject-study-options.repo.js";

export async function readSubjectStudyOptions(subjectId: string): Promise<SubjectStudyOptions | null> {
  const [rows, resolver] = await Promise.all([
    listSubjectStudyOptionRows(),
    loadStudyOptionsResolver(),
  ]);
  const row = rows.find((candidate) => candidate.id === subjectId);

  if (!row) {
    return null;
  }

  const { effective, sources } = resolver.resolve(subjectId);
  const plan = resolver.resolvePlan(subjectId);

  return {
    own: {
      newCardsPerDay: row.options.newCardsPerDay ?? null,
      maxReviewsPerDay: row.options.maxReviewsPerDay ?? null,
      learningStepsMinutes: row.options.learningStepsMinutes ?? null,
      relearningStepsMinutes: row.options.relearningStepsMinutes ?? null,
      desiredRetention: row.options.desiredRetention ?? null,
      studyIntent: row.studyIntent,
      examDate: row.examDate,
      detailLevel: row.detailLevel,
      hintingEnabled: row.hintingEnabled,
    },
    intent: { studyIntent: plan.intent, examDate: plan.examDate, source: plan.intentSource },
    effective,
    sources,
  };
}

export class StudyIntentRefusedError extends Error {
  constructor(readonly code: ExamDateErrorCode) {
    super(code);
  }
}

export async function updateSubjectStudyOptions(
  subjectId: string,
  input: UpdateSubjectStudyOptionsInput,
  now: Date = new Date(),
): Promise<SubjectStudyOptions | null> {
  const rows = await listSubjectStudyOptionRows();
  const row = rows.find((candidate) => candidate.id === subjectId);

  if (!row) {
    return null;
  }

  const verdict = validateStudyIntentPatch(
    { studyIntent: row.studyIntent, examDate: row.examDate },
    { studyIntent: input.studyIntent, examDate: input.examDate },
    await readStudyPlanToday(now),
  );

  if (!verdict.ok) {
    throw new StudyIntentRefusedError(verdict.error);
  }

  const found = await writeSubjectStudyOptions(
    subjectId,
    input,
    getDb(),
    verdict.changed ? { ...verdict.next, restampPlan: verdict.restampPlan } : undefined,
  );

  return found ? readSubjectStudyOptions(subjectId) : null;
}
