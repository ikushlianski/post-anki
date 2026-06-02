import { z } from "zod";
import { gapSchema } from "./gap";
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

export const dailyPushResponseSchema = z.object({
  push: dailyPushSchema.nullable(),
  question: probeQuestionSchema.nullable(),
});

export type DailyPushResponse = z.infer<typeof dailyPushResponseSchema>;
