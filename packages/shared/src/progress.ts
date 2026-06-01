import { z } from "zod";

export const topicProgressStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "mastered",
]);

export type TopicProgressStatus = z.infer<typeof topicProgressStatusSchema>;

export const topicProgressSchema = z.object({
  status: topicProgressStatusSchema,
  maturity: z.number().int().min(0).max(100),
  attempts: z.number().int().min(0),
  lastInteractedAt: z.string().nullable(),
});

export type TopicProgress = z.infer<typeof topicProgressSchema>;

export const moduleProgressSchema = z.object({
  topicsIncluded: z.number().int(),
  topicsMastered: z.number().int(),
  percent: z.number().int(),
});

export type ModuleProgress = z.infer<typeof moduleProgressSchema>;

export const curriculumProgressSchema = moduleProgressSchema;

export type CurriculumProgress = z.infer<typeof curriculumProgressSchema>;
