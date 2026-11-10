import { z } from "zod";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";
import { reviewPointsSchema } from "./gamification";
import { validTimeZoneSchema } from "./time-zone";
import { cardKeySchema } from "./card-key";

export const reviewGradeSchema = z.enum(["again", "hard", "good", "easy"]);

export type ReviewGrade = z.infer<typeof reviewGradeSchema>;

export const cardPhaseSchema = z.enum(["new", "learning", "review", "relearning"]);

export type CardPhase = z.infer<typeof cardPhaseSchema>;

const optionalScopeId = z.string().min(1).optional();

export const reviewCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  tz: validTimeZoneSchema.default("UTC"),
  tagId: optionalScopeId,
  topicId: optionalScopeId,
  knowledgeBitId: optionalScopeId,
  subjectId: optionalScopeId,
  aheadDays: z.coerce.number().int().min(0).max(30).default(0),
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
  context: z.string().nullable().optional(),
  answer: z.string(),
  sentence: z.string().optional(),
  cardKey: cardKeySchema.optional(),
  background: z.string().nullable(),
  isAiGenerated: z.boolean(),
  aiSuggestion: z.string().nullable().optional(),
  originalPhrase: z.string().optional(),
  sourceLinks: z.array(z.string()),
  subjectId: z.string().nullable().optional(),
  phase: cardPhaseSchema,
  leech: z.boolean(),
  intervalPreview: intervalPreviewSchema,
});

export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const reviewCardsResponseSchema = z.object({
  cards: z.array(reviewCardSchema),
  counts: reviewCountsSchema,
  newRemainingToday: z.number().int().min(0),
  newLimitReached: z.boolean().optional(),
  limitReached: z.boolean().optional(),
  reviewedToday: z.number().int().min(0).optional(),
  limit: z.number().int().min(0).optional(),
  nextDueAt: z.string().nullable(),
});

export type ReviewCardsResponse = z.infer<typeof reviewCardsResponseSchema>;

export const reviewPackCardSchema = reviewCardSchema.extend({
  alternates: z.array(reviewCardSchema),
});

export type ReviewPackCard = z.infer<typeof reviewPackCardSchema>;

export const reviewPackSchema = z.object({
  generatedAt: z.string(),
  dueBefore: z.string(),
  truncated: z.boolean(),
  cards: z.array(reviewPackCardSchema),
});

export type ReviewPack = z.infer<typeof reviewPackSchema>;

export const reviewPackQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
});

export const recordReviewInputSchema = z.object({
  variantId: z.string().min(1),
  grade: reviewGradeSchema,
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  requestId: z.string().uuid().optional(),
  tz: validTimeZoneSchema.optional(),
  burySiblings: z.boolean().default(true),
  rehearsal: z.boolean().optional(),
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  sentAt: z.string().datetime({ offset: true }).optional(),
});

export type RecordReviewInput = z.input<typeof recordReviewInputSchema>;

export const recordReviewResultSchema = z.object({
  reviewId: z.string(),
  knowledgeBitId: z.string(),
  phase: cardPhaseSchema,
  dueAt: z.string(),
  intervalDays: z.number(),
  lapses: z.number().int().min(0),
  leech: z.boolean(),
  suspended: z.boolean(),
  points: reviewPointsSchema,
  cardKey: cardKeySchema,
  buriedVariantIds: z.array(z.string()),
  followUp: reviewCardSchema.nullable().optional(),
  superseded: z.boolean().optional(),
});

export type RecordReviewResult = z.infer<typeof recordReviewResultSchema>;

export const undoReviewResultSchema = z.object({
  knowledgeBitId: z.string(),
  variantId: z.string(),
  cardKey: cardKeySchema,
  unburiedVariantIds: z.array(z.string()),
});

export type UndoReviewResult = z.infer<typeof undoReviewResultSchema>;

export const scheduleControlInputSchema = z
  .object({
    suspended: z.boolean().optional(),
    buried: z.boolean().optional(),
    variantId: z.string().min(1).optional(),
    tz: validTimeZoneSchema.default("UTC"),
  })
  .refine((value) => value.suspended !== undefined || value.buried !== undefined, {
    message: "suspended or buried is required",
  });

export type ScheduleControlInput = z.infer<typeof scheduleControlInputSchema>;

export const scheduleControlResultSchema = z.object({
  knowledgeBitId: z.string(),
  suspended: z.boolean(),
  buriedUntil: z.string().nullable(),
  leech: z.boolean(),
  cardKey: cardKeySchema.nullable(),
});

export type ScheduleControlResult = z.infer<typeof scheduleControlResultSchema>;
