import type { ResolvedStudyPlan } from "@post-anki/core";
import type {
  ComplexityPreview,
  ExamDateErrorCode,
  SubjectStudyOptions,
  UpdateSubjectStudyOptionsInput,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { readStudyPlanClock, readStudyPlanToday } from "../study-plan/study-plan-today.js";
import { previewGradeIntervals } from "../knowledge-bit/knowledge-bit-grade-schedule.js";
import { toScheduleOptions } from "../knowledge-bit/knowledge-bit-schedule-options.js";
import { validateStudyIntentPatch } from "./study-intent-patch.js";
import { loadStudyOptionsResolver } from "./subject-study-options-resolver.js";
import { listSubjectStudyOptionRows, writeSubjectStudyOptions } from "./subject-study-options.repo.js";

const SECONDS_PER_DAY = 86_400;
const REFERENCE_CARD = { easeFactor: 2.5, intervalDays: 5, phase: "review", learningStep: 0, lapses: 0 } as const;

export async function previewReferenceGaps(plan: ResolvedStudyPlan, now: Date): Promise<ComplexityPreview> {
  const clock = await readStudyPlanClock(now);
  const gaps = previewGradeIntervals(REFERENCE_CARD, now, toScheduleOptions(plan, clock));

  return {
    goodDays: Math.round(gaps.good / SECONDS_PER_DAY),
    easyDays: Math.round(gaps.easy / SECONDS_PER_DAY),
  };
}

export async function readSubjectStudyOptions(
  subjectId: string,
  now: Date = new Date(),
): Promise<SubjectStudyOptions | null> {
  const [rows, resolver] = await Promise.all([
    listSubjectStudyOptionRows(),
    loadStudyOptionsResolver(),
  ]);
  const row = rows.find((candidate) => candidate.id === subjectId);

  if (!row) {
    return null;
  }

  const { effective, sources, complexity } = resolver.resolve(subjectId);
  const plan = resolver.resolvePlan(subjectId);
  const preview = await previewReferenceGaps(plan, now);

  return {
    own: {
      newCardsPerDay: row.options.newCardsPerDay ?? null,
      maxReviewsPerDay: row.options.maxReviewsPerDay ?? null,
      learningStepsMinutes: row.options.learningStepsMinutes ?? null,
      relearningStepsMinutes: row.options.relearningStepsMinutes ?? null,
      desiredRetention: row.options.desiredRetention ?? null,
      complexityLevel: row.complexityLevel,
      studyIntent: row.studyIntent,
      examDate: row.examDate,
      detailLevel: row.detailLevel,
      hintingEnabled: row.hintingEnabled,
    },
    intent: { studyIntent: plan.intent, examDate: plan.examDate, source: plan.intentSource },
    effective,
    complexity,
    preview,
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

  return found ? readSubjectStudyOptions(subjectId, now) : null;
}
