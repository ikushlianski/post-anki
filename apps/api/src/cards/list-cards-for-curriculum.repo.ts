import { and, asc, eq } from "drizzle-orm";
import type { CardBrowserRow } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { topicCardSets, topicCards, topicCardVariants, topics, modules } from "../db/schema.js";

// The cards browser's own read — every ready variant across the whole
// curriculum, flattened to one row each, in a single joined query.
export async function listCardsForCurriculum(curriculumId: string): Promise<CardBrowserRow[]> {
  const rows = await getDb()
    .select({
      variantId: topicCardVariants.id,
      variantOrder: topicCardVariants.order,
      cardId: topicCards.id,
      cardOrder: topicCards.order,
      concept: topicCards.concept,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      topicId: topics.id,
      topicOrder: topics.order,
      topicTitle: topics.title,
      moduleOrder: modules.order,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .innerJoin(modules, eq(topics.moduleId, modules.id))
    .where(and(eq(topics.curriculumId, curriculumId), eq(topicCardSets.status, "ready")))
    .orderBy(
      asc(modules.order),
      asc(topics.order),
      asc(topicCards.order),
      asc(topicCardVariants.order),
      asc(topicCardVariants.id),
    );

  return rows.map((row) => ({
    variantId: row.variantId,
    cardId: row.cardId,
    concept: row.concept,
    prompt: row.prompt,
    answer: row.answer,
    topicId: row.topicId,
    topicTitle: row.topicTitle,
  }));
}
