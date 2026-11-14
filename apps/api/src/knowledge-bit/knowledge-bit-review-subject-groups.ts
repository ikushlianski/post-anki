import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";

export type GroupedReviewCardRow = KnowledgeBitReviewCardRow & { subjectPath: string | null };

export function groupReviewCardsBySubject(
  cards: KnowledgeBitReviewCardRow[],
  labels: Map<string, string>,
): GroupedReviewCardRow[] {
  const order = new Map<string | null, number>();

  for (const card of cards) {
    if (!order.has(card.subjectId)) {
      order.set(card.subjectId, order.size);
    }
  }

  return cards
    .map((card, index) => ({
      card: { ...card, subjectPath: card.subjectId ? (labels.get(card.subjectId) ?? null) : null },
      group: order.get(card.subjectId) ?? 0,
      index,
    }))
    .sort((a, b) => a.group - b.group || a.index - b.index)
    .map(({ card }) => card);
}
