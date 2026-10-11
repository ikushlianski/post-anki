import { z } from "zod";
import { topicModuleSearchResultSchema, type TopicModuleSearchResult } from "@post-anki/shared";
import { normalizeSearchQuery } from "@post-anki/core";
import { escapeLikePattern, searchCards } from "../cards/card-search.repo.js";
import { searchCurricula, searchTopics, searchTopicsAndModulesRanked } from "../search/search.repo.js";
import { searchByTagNameAcrossNodes, searchKnowledgeBitsRanked } from "../search/search-tag-and-bit.repo.js";

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
      `Max items per result group (cards, courses, topics, rankedTopics, modules, knowledgeBits), default ${SEARCH_KNOWLEDGE_ITEMS_DEFAULT_LIMIT}, clamped to ${SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT}`,
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
  // Full-text and tag-name matches, additive to the plain name matches above.
  rankedTopics: z.array(topicModuleSearchResultSchema),
  modules: z.array(topicModuleSearchResultSchema),
  knowledgeBits: z.array(topicModuleSearchResultSchema),
});

export type SearchKnowledgeItemsResult = z.infer<typeof searchKnowledgeItemsResultSchema>;

function dedupeAndGroupByKind(
  matches: TopicModuleSearchResult[][],
  limit: number,
): { rankedTopics: TopicModuleSearchResult[]; modules: TopicModuleSearchResult[]; knowledgeBits: TopicModuleSearchResult[] } {
  const byKindAndId = new Map<string, TopicModuleSearchResult>();

  for (const result of matches.flat()) {
    const key = `${result.kind}-${result.id}`;
    const existing = byKindAndId.get(key);

    if (!existing || result.rank > existing.rank) {
      byKindAndId.set(key, result);
    }
  }

  const sorted = Array.from(byKindAndId.values()).sort(
    (a, b) => b.rank - a.rank || a.id.localeCompare(b.id),
  );

  return {
    rankedTopics: sorted.filter((r) => r.kind === "topic").slice(0, limit),
    modules: sorted.filter((r) => r.kind === "module").slice(0, limit),
    knowledgeBits: sorted.filter((r) => r.kind === "bit").slice(0, limit),
  };
}

// Merges the ready-cards text search with the existing course/topic name
// search, plus a full-text/tag-name search over topics, modules, and bits.
export async function searchKnowledgeItems(
  input: SearchKnowledgeItemsInput,
): Promise<SearchKnowledgeItemsResult> {
  const limit = Math.min(
    Math.max(input.limit ?? SEARCH_KNOWLEDGE_ITEMS_DEFAULT_LIMIT, 0),
    SEARCH_KNOWLEDGE_ITEMS_MAX_LIMIT,
  );

  const normalizedQuery = normalizeSearchQuery(input.query);

  const rankedSearch =
    normalizedQuery === null
      ? Promise.resolve([[], [], []] as TopicModuleSearchResult[][])
      : Promise.all([
          searchTopicsAndModulesRanked(normalizedQuery, limit),
          searchKnowledgeBitsRanked(normalizedQuery, limit),
          searchByTagNameAcrossNodes(escapeLikePattern(normalizedQuery), limit),
        ]);

  const [[cards, courses, topics], rankedMatches] = await Promise.all([
    Promise.all([searchCards(input.query, limit), searchCurricula(input.query), searchTopics(input.query)]),
    rankedSearch,
  ]);

  const { rankedTopics, modules, knowledgeBits } = dedupeAndGroupByKind(rankedMatches, limit);

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
    rankedTopics,
    modules,
    knowledgeBits,
  };
}
