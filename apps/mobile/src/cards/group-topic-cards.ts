import type { TopicCardRow, TopicCardSetRow, TopicCardVariantRow } from "./cards.collection";

export interface TopicCardJoinRow {
  sets: TopicCardSetRow;
  cards: TopicCardRow;
  variants: TopicCardVariantRow;
}

export interface GroupedTopicCard {
  cardId: string;
  concept: string;
  variants: { prompt: string; answer: string }[];
}

// Regroups the join's one-row-per-variant output into one entry per card.
export function groupTopicCardRows(rows: TopicCardJoinRow[]): GroupedTopicCard[] {
  const cardOrderById = new Map<string, number>();
  const conceptById = new Map<string, string>();
  const variantsByCardId = new Map<string, { order: number; prompt: string; answer: string }[]>();

  for (const row of rows) {
    const cardId = row.cards.id;

    cardOrderById.set(cardId, row.cards.order);
    conceptById.set(cardId, row.cards.concept);

    const existing = variantsByCardId.get(cardId) ?? [];

    existing.push({ order: row.variants.order, prompt: row.variants.prompt, answer: row.variants.answer });
    variantsByCardId.set(cardId, existing);
  }

  return Array.from(cardOrderById.keys())
    .sort((a, b) => cardOrderById.get(a)! - cardOrderById.get(b)!)
    .map((cardId) => ({
      cardId,
      concept: conceptById.get(cardId)!,
      variants: (variantsByCardId.get(cardId) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(({ prompt, answer }) => ({ prompt, answer })),
    }));
}
