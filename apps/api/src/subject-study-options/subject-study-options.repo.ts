import { eq } from "drizzle-orm";
import {
  desiredRetentionSchema,
  newCardsPerDaySchema,
  stepsMinutesSchema,
  detailLevelSchema,
  studyIntentSchema,
  type DetailLevel,
  type StudyIntent,
  type StudyOptionsOverride,
  type UpdateSubjectStudyOptionsInput,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";

export interface SubjectStudyOptionsRow {
  id: string;
  parentId: string | null;
  options: StudyOptionsOverride;
  studyIntent: StudyIntent | null;
  examDate: string | null;
  examPlannedAt: string | null;
  detailLevel: DetailLevel | null;
  hintingEnabled: boolean | null;
}

export interface StudyIntentWrite {
  studyIntent: StudyIntent | null;
  examDate: string | null;
  restampPlan: boolean;
}

const optionColumns = {
  id: subjects.id,
  parentId: subjects.parentId,
  newCardsPerDay: subjects.newCardsPerDay,
  learningStepsMinutes: subjects.learningStepsMinutes,
  relearningStepsMinutes: subjects.relearningStepsMinutes,
  desiredRetention: subjects.desiredRetention,
  studyIntent: subjects.studyIntent,
  examDate: subjects.examDate,
  examPlannedAt: subjects.examPlannedAt,
  detailLevel: subjects.detailLevel,
  hintingEnabled: subjects.hintingEnabled,
};

function toRow(row: {
  id: string;
  parentId: string | null;
  newCardsPerDay: number | null;
  learningStepsMinutes: number[] | null;
  relearningStepsMinutes: number[] | null;
  desiredRetention: number | null;
  studyIntent: string | null;
  examDate: string | null;
  examPlannedAt: Date | null;
  detailLevel: string | null;
  hintingEnabled: boolean | null;
}): SubjectStudyOptionsRow {
  return {
    id: row.id,
    parentId: row.parentId,
    options: {
      newCardsPerDay: newCardsPerDaySchema.nullable().catch(null).parse(row.newCardsPerDay),
      learningStepsMinutes: stepsMinutesSchema.nullable().catch(null).parse(row.learningStepsMinutes),
      relearningStepsMinutes: stepsMinutesSchema
        .nullable()
        .catch(null)
        .parse(row.relearningStepsMinutes),
      desiredRetention: desiredRetentionSchema.nullable().catch(null).parse(row.desiredRetention),
    },
    studyIntent: studyIntentSchema.nullable().catch(null).parse(row.studyIntent),
    examDate: row.examDate,
    examPlannedAt: row.examPlannedAt?.toISOString() ?? null,
    detailLevel: detailLevelSchema.nullable().catch(null).parse(row.detailLevel),
    hintingEnabled: row.hintingEnabled,
  };
}

export async function listSubjectStudyOptionRows(
  db: DbExecutor = getDb(),
): Promise<SubjectStudyOptionsRow[]> {
  return (await db.select(optionColumns).from(subjects)).map(toRow);
}

export async function writeSubjectStudyOptions(
  subjectId: string,
  input: UpdateSubjectStudyOptionsInput,
  db: DbExecutor = getDb(),
  intent?: StudyIntentWrite,
): Promise<boolean> {
  const values = {
    ...(input.newCardsPerDay !== undefined && { newCardsPerDay: input.newCardsPerDay }),
    ...(input.learningStepsMinutes !== undefined && {
      learningStepsMinutes: input.learningStepsMinutes,
    }),
    ...(input.relearningStepsMinutes !== undefined && {
      relearningStepsMinutes: input.relearningStepsMinutes,
    }),
    ...(input.desiredRetention !== undefined && { desiredRetention: input.desiredRetention }),
    ...(input.detailLevel !== undefined && { detailLevel: input.detailLevel }),
    ...(input.hintingEnabled !== undefined && { hintingEnabled: input.hintingEnabled }),
    ...(intent && {
      studyIntent: intent.studyIntent,
      examDate: intent.examDate,
      ...(intent.studyIntent !== "exam" && { examPlannedAt: null }),
      ...(intent.restampPlan && { examPlannedAt: new Date() }),
    }),
  };

  if (Object.keys(values).length === 0) {
    const found = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId));

    return found.length > 0;
  }

  const updated = await db
    .update(subjects)
    .set(values)
    .where(eq(subjects.id, subjectId))
    .returning({ id: subjects.id });

  return updated.length > 0;
}
