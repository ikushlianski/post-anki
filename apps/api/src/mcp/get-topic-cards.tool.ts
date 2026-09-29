import { z } from "zod";
import { getCardsByTopic } from "../cards/cards.repo.js";

export const getTopicCardsInputSchema = z.object({
  topicId: z.string().min(1).describe("Topic id, e.g. from get_course_structure"),
});

export type GetTopicCardsInput = z.infer<typeof getTopicCardsInputSchema>;

export const getTopicCardsVariantSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
});

export const getTopicCardsCardSchema = z.object({
  id: z.string(),
  concept: z.string(),
  variants: z.array(getTopicCardsVariantSchema),
});

export const getTopicCardsResultSchema = z.object({
  topicId: z.string(),
  status: z.enum(["generating", "ready", "failed"]),
  cards: z.array(getTopicCardsCardSchema),
});

export type GetTopicCardsResult = z.infer<typeof getTopicCardsResultSchema>;

// Null means no card set or unknown topic. Non-ready sets return no cards,
// since regeneration leaves stale rows.
export async function getTopicCards(input: GetTopicCardsInput): Promise<GetTopicCardsResult | null> {
  const cardSet = await getCardsByTopic(input.topicId);

  if (!cardSet) {
    return null;
  }

  return {
    topicId: cardSet.topicId,
    status: cardSet.status,
    cards:
      cardSet.status === "ready"
        ? cardSet.cards.map((card) => ({
            id: card.id,
            concept: card.concept,
            variants: card.variants.map((variant) => ({
              prompt: variant.prompt,
              answer: variant.answer,
            })),
          }))
        : [],
  };
}
