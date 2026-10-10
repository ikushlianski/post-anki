import { z } from "zod";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";

export const reviewGradeSchema = z.enum(["again", "hard", "good", "easy"]);

export type ReviewGrade = z.infer<typeof reviewGradeSchema>;

export const cardPhaseSchema = z.enum(["new", "learning", "review", "relearning"]);

export type CardPhase = z.infer<typeof cardPhaseSchema>;

const optionalScopeId = z.string().min(1).optional();

export const reviewCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  tagId: optionalScopeId,
  topicId: optionalScopeId,
  knowledgeBitId: optionalScopeId,
});

export type ReviewCardsQuery = z.infer<typeof reviewCardsQuerySchema>;

export const reviewCardSchema = z.object({
  variantId: z.string(),
  knowledgeBitId: z.string(),
  kind: knowledgeBitQuestionVariantKindSchema,
  prompt: z.string(),
  answer: z.string(),
  background: z.string().nullable(),
  phase: cardPhaseSchema,
});

export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const reviewCardsResponseSchema = z.object({
  cards: z.array(reviewCardSchema),
});

export type ReviewCardsResponse = z.infer<typeof reviewCardsResponseSchema>;

export const recordReviewInputSchema = z.object({
  variantId: z.string().min(1),
  grade: reviewGradeSchema,
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
});

export type RecordReviewInput = z.infer<typeof recordReviewInputSchema>;

export const recordReviewResultSchema = z.object({
  reviewId: z.string(),
  knowledgeBitId: z.string(),
  phase: cardPhaseSchema,
  dueAt: z.string(),
  intervalDays: z.number(),
});

export type RecordReviewResult = z.infer<typeof recordReviewResultSchema>;
