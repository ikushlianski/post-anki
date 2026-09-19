import { z } from "zod";

export const cardSetStatusSchema = z.enum(["generating", "ready", "failed"]);

export type CardSetStatus = z.infer<typeof cardSetStatusSchema>;

export const cardVariantSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  order: z.number(),
  prompt: z.string(),
  answer: z.string(),
});

export type CardVariant = z.infer<typeof cardVariantSchema>;

export const topicCardSchema = z.object({
  id: z.string(),
  cardSetId: z.string(),
  order: z.number(),
  concept: z.string(),
  variants: z.array(cardVariantSchema),
});

export type TopicCard = z.infer<typeof topicCardSchema>;

export const topicCardSetSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  status: cardSetStatusSchema,
  createdAt: z.string(),
  cards: z.array(topicCardSchema),
});

export type TopicCardSet = z.infer<typeof topicCardSetSchema>;

// One row per variant (a question/answer pair), carrying the owning
// topic's title alongside — the flat shape the cards browser table renders.
export const cardBrowserRowSchema = z.object({
  variantId: z.string(),
  cardId: z.string(),
  concept: z.string(),
  prompt: z.string(),
  answer: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
});

export type CardBrowserRow = z.infer<typeof cardBrowserRowSchema>;

// Cost-visibility counts for one embedding scan, per entity.
export const embeddingScanCountsSchema = z.object({
  embeddedCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  capped: z.boolean(),
});

export type EmbeddingScanCounts = z.infer<typeof embeddingScanCountsSchema>;

export const triggerCardEmbeddingScanResultSchema = embeddingScanCountsSchema.extend({
  facts: embeddingScanCountsSchema,
});

export type TriggerCardEmbeddingScanResult = z.infer<
  typeof triggerCardEmbeddingScanResultSchema
>;

export const cardMatchResultSchema = z.object({
  variantId: z.string(),
  kind: z.enum(["card", "fact"]),
  prompt: z.string(),
  answer: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  similarity: z.number(),
  subjectId: z.string(),
  subjectName: z.string(),
  tags: z.array(z.string()),
  domainNodeNames: z.array(z.string()),
});

export type CardMatchResult = z.infer<typeof cardMatchResultSchema>;
