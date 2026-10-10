import { z } from "zod";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";

export const reviewGradeSchema = z.enum(["again", "hard", "good", "easy"]);

export type ReviewGrade = z.infer<typeof reviewGradeSchema>;

export const cardPhaseSchema = z.enum(["new", "learning", "review", "relearning"]);

export type CardPhase = z.infer<typeof cardPhaseSchema>;

const optionalScopeId = z.string().min(1).optional();

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });

    return true;
  } catch {
    return false;
  }
};

export const reviewCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  tz: z.string().min(1).refine(isValidTimeZone, "invalid time zone").default("UTC"),
  tagId: optionalScopeId,
  topicId: optionalScopeId,
  knowledgeBitId: optionalScopeId,
});

export type ReviewCardsQuery = z.infer<typeof reviewCardsQuerySchema>;

export const intervalPreviewSchema = z.object({
  again: z.number().int().min(0),
  hard: z.number().int().min(0),
  good: z.number().int().min(0),
  easy: z.number().int().min(0),
});

export type IntervalPreview = z.infer<typeof intervalPreviewSchema>;

export const reviewCountsSchema = z.object({
  new: z.number().int().min(0),
  learning: z.number().int().min(0),
  review: z.number().int().min(0),
});

export type ReviewCounts = z.infer<typeof reviewCountsSchema>;

export const reviewCardSchema = z.object({
  variantId: z.string(),
  knowledgeBitId: z.string(),
  kind: knowledgeBitQuestionVariantKindSchema,
  prompt: z.string(),
  answer: z.string(),
  background: z.string().nullable(),
  phase: cardPhaseSchema,
  intervalPreview: intervalPreviewSchema,
});

export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const reviewCardsResponseSchema = z.object({
  cards: z.array(reviewCardSchema),
  counts: reviewCountsSchema,
  newRemainingToday: z.number().int().min(0),
  nextDueAt: z.string().nullable(),
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
  lapses: z.number().int().min(0),
});

export type RecordReviewResult = z.infer<typeof recordReviewResultSchema>;
