import { and, asc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { topicCardSets, topicCards, topicCardVariants, topics } from "../db/schema.js";

export interface CardSearchResult {
  cardId: string;
  topicId: string;
  curriculumId: string;
  concept: string;
  prompt: string;
  answer: string;
}

// Escapes ILIKE's wildcard characters so a query with a literal % or _
// matches that literal character, not a wildcard.
export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}

// Case-insensitive text match over concept/prompt/answer, ready sets only.
// No embedding or LLM call, so a search has no token cost.
export async function searchCards(query: string, limit: number): Promise<CardSearchResult[]> {
  const pattern = `%${escapeLikePattern(query)}%`;

  const rows = await getDb()
    .select({
      cardId: topicCards.id,
      topicId: topics.id,
      curriculumId: topics.curriculumId,
      concept: topicCards.concept,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(
      and(
        eq(topicCardSets.status, "ready"),
        or(
          ilike(topicCards.concept, pattern),
          ilike(topicCardVariants.prompt, pattern),
          ilike(topicCardVariants.answer, pattern),
        ),
      ),
    )
    .orderBy(asc(topics.curriculumId), asc(topicCards.id), asc(topicCardVariants.order), asc(topicCardVariants.id))
    .limit(limit);

  return rows;
}
