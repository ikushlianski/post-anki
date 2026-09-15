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
