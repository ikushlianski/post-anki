import { z } from "zod";

export const openQuestionSourceTypeSchema = z.enum(["probe_question", "socratic_turn"]);

export type OpenQuestionSourceType = z.infer<typeof openQuestionSourceTypeSchema>;

export const openQuestionStatusSchema = z.enum(["open", "answered", "dismissed"]);

export type OpenQuestionStatus = z.infer<typeof openQuestionStatusSchema>;

export const openQuestionSchema = z.object({
  id: z.string(),
  sourceType: openQuestionSourceTypeSchema,
  sourceItemId: z.string(),
  topicId: z.string().nullable(),
  topicTitle: z.string().nullable(),
  questionText: z.string(),
  status: openQuestionStatusSchema,
  answerText: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type OpenQuestion = z.infer<typeof openQuestionSchema>;

export const captureOpenQuestionInput = z.object({
  questionText: z.string().trim().min(1).max(1000),
});

export type CaptureOpenQuestionInput = z.infer<typeof captureOpenQuestionInput>;

export const resolveOpenQuestionInput = z.object({
  status: z.enum(["answered", "dismissed"]),
  answerText: z.string().trim().max(2000).optional(),
});

export type ResolveOpenQuestionInput = z.infer<typeof resolveOpenQuestionInput>;

export const listOpenQuestionsQuerySchema = z.object({
  status: openQuestionStatusSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export type ListOpenQuestionsQuery = z.infer<typeof listOpenQuestionsQuerySchema>;

export const openQuestionsListResultSchema = z.object({
  items: z.array(openQuestionSchema),
  totalCount: z.number().int().nonnegative(),
});

export type OpenQuestionsListResult = z.infer<typeof openQuestionsListResultSchema>;
