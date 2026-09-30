import { z } from "zod";
import { escapeLikePattern, searchCards } from "../cards/card-search.repo.js";
import { searchCurricula, searchTopics } from "../search/search.repo.js";

export const SEARCH_KNOWLEDGE_ITEMS_DEFAULT_LIMIT = 50;
export const SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT = 200;

export const searchKnowledgeItemsInputSchema = z.object({
  query: z.string().min(2).describe("Search text, matched case-insensitively; at least 2 characters"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Max items per result group (cards, courses, topics), default ${SEARCH_KNOWLEDGE_ITEMS_DEFAULT_LIMIT}, clamped to ${SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT}`,
    ),
});

export type SearchKnowledgeItemsInput = z.infer<typeof searchKnowledgeItemsInputSchema>;

export const searchKnowledgeItemsCardSchema = z.object({
  cardId: z.string(),
  topicId: z.string(),
  curriculumId: z.string(),
  concept: z.string(),
  prompt: z.string(),
  answer: z.string(),
});

export const searchKnowledgeItemsCourseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const searchKnowledgeItemsTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  curriculumId: z.string(),
});

export const searchKnowledgeItemsResultSchema = z.object({
  cards: z.array(searchKnowledgeItemsCardSchema),
  courses: z.array(searchKnowledgeItemsCourseSchema),
  topics: z.array(searchKnowledgeItemsTopicSchema),
});

export type SearchKnowledgeItemsResult = z.infer<typeof searchKnowledgeItemsResultSchema>;

// Merges the ready-cards text search with the existing course/topic name
// search. No embedding or LLM call, so a search has no token cost.
export async function searchKnowledgeItems(
  input: SearchKnowledgeItemsInput,
): Promise<SearchKnowledgeItemsResult> {
  const limit = Math.min(
    Math.max(input.limit ?? SEARCH_KNOWLEDGE_ITEMS_DEFAULT_LIMIT, 0),
    SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT,
  );

  const escapedQuery = escapeLikePattern(input.query);

  const [cards, courses, topics] = await Promise.all([
    searchCards(input.query, limit),
    searchCurricula(escapedQuery),
    searchTopics(escapedQuery),
  ]);

  const sortedCourses = [...courses].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const sortedTopics = [...topics].sort(
    (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );

  return {
    cards,
    courses: sortedCourses.slice(0, limit),
    topics: sortedTopics.slice(0, limit),
  };
}
