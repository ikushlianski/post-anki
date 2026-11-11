import { z } from "zod";
import { maxReviewsPerDaySchema, newCardsPerDaySchema } from "./admin-settings";
import {
  desiredRetentionSchema,
  stepsMinutesSchema,
} from "./study-option-fields";
import { complexityLevelSchema, complexityPreviewSchema, complexityViewSchema } from "./study-complexity";
import { examDateSchema, studyIntentSchema } from "./study-plan";
import { detailLevelSchema, hintingEnabledSchema } from "./subject-learning-settings";

export const studyOptionsSchema = z.object({
  newCardsPerDay: newCardsPerDaySchema,
  maxReviewsPerDay: maxReviewsPerDaySchema,
  learningStepsMinutes: stepsMinutesSchema,
  relearningStepsMinutes: stepsMinutesSchema,
  desiredRetention: desiredRetentionSchema,
});

export type StudyOptions = z.infer<typeof studyOptionsSchema>;

export type StudyOptionKey = keyof StudyOptions;

export const STUDY_OPTION_KEYS: StudyOptionKey[] = [
  "newCardsPerDay",
  "maxReviewsPerDay",
  "learningStepsMinutes",
  "relearningStepsMinutes",
  "desiredRetention",
];

export const studyOptionsOverrideSchema = z.object({
  newCardsPerDay: newCardsPerDaySchema.nullable().optional(),
  maxReviewsPerDay: maxReviewsPerDaySchema.nullable().optional(),
  learningStepsMinutes: stepsMinutesSchema.nullable().optional(),
  relearningStepsMinutes: stepsMinutesSchema.nullable().optional(),
  desiredRetention: desiredRetentionSchema.nullable().optional(),
  complexityLevel: complexityLevelSchema.nullable().optional(),
});

export type StudyOptionsOverride = z.infer<typeof studyOptionsOverrideSchema>;

export const updateSubjectStudyOptionsInput = studyOptionsOverrideSchema
  .extend({
    studyIntent: studyIntentSchema.nullable().optional(),
    examDate: examDateSchema.nullable().optional(),
    detailLevel: detailLevelSchema.nullable().optional(),
    hintingEnabled: hintingEnabledSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "at least one option is required",
  })
  .refine(
    (value) =>
      typeof value.examDate !== "string" || value.studyIntent === undefined || value.studyIntent === "exam",
    { message: "exam date needs the Exam intent", path: ["examDate"] },
  );

export type UpdateSubjectStudyOptionsInput = z.infer<typeof updateSubjectStudyOptionsInput>;

export const studyOptionSourceSchema = z.string();

export const subjectStudyOptionsSchema = z.object({
  own: z.object({
    newCardsPerDay: newCardsPerDaySchema.nullable(),
    maxReviewsPerDay: maxReviewsPerDaySchema.nullable(),
    learningStepsMinutes: stepsMinutesSchema.nullable(),
    relearningStepsMinutes: stepsMinutesSchema.nullable(),
    desiredRetention: desiredRetentionSchema.nullable(),
    complexityLevel: complexityLevelSchema.nullable(),
    studyIntent: studyIntentSchema.nullable(),
    examDate: examDateSchema.nullable(),
    detailLevel: detailLevelSchema.nullable(),
    hintingEnabled: hintingEnabledSchema.nullable(),
  }),
  intent: z.object({
    studyIntent: studyIntentSchema,
    examDate: examDateSchema.nullable(),
    source: studyOptionSourceSchema,
  }),
  effective: studyOptionsSchema,
  complexity: complexityViewSchema,
  preview: complexityPreviewSchema,
  sources: z.object({
    newCardsPerDay: studyOptionSourceSchema,
    maxReviewsPerDay: studyOptionSourceSchema,
    learningStepsMinutes: studyOptionSourceSchema,
    relearningStepsMinutes: studyOptionSourceSchema,
    desiredRetention: studyOptionSourceSchema,
  }),
});

export type SubjectStudyOptions = z.infer<typeof subjectStudyOptionsSchema>;
