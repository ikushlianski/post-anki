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
