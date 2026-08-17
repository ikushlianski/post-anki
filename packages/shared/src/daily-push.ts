import { z } from "zod";
import { gapSchema } from "./gap";
import { livenessEntityTypeSchema, livenessScoreSchema } from "./liveness";
import { probeQuestionSchema } from "./probe";

export const dailyPushReasonSchema = z.enum(["wanted", "weakest", "refresh"]);

export type DailyPushReason = z.infer<typeof dailyPushReasonSchema>;

export const dailyPushSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  curriculumId: z.string(),
  curriculumName: z.string(),
  gap: gapSchema,
  reason: dailyPushReasonSchema,
});

export type DailyPush = z.infer<typeof dailyPushSchema>;

export const nudgeSubjectSchema = z.object({
  entityType: livenessEntityTypeSchema,
  entityId: z.string(),
  name: z.string(),
  score: livenessScoreSchema.nullable(),
});

export type NudgeSubject = z.infer<typeof nudgeSubjectSchema>;

export const dailyPushNudgeSchema = nudgeSubjectSchema.extend({
  related: z.array(nudgeSubjectSchema),
});

export type DailyPushNudge = z.infer<typeof dailyPushNudgeSchema>;

export const dailyPushResponseSchema = z.object({
  push: dailyPushSchema.nullable(),
  question: probeQuestionSchema.nullable(),
  nudge: dailyPushNudgeSchema.nullable(),
});

export type DailyPushResponse = z.infer<typeof dailyPushResponseSchema>;
