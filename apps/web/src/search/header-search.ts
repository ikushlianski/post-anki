import type { SearchResponse, SearchResultItem, TopicModuleSearchResult } from '@post-anki/shared'

export interface HeaderSearchResults {
  subjects: SearchResultItem[]
  curricula: SearchResultItem[]
  items: TopicModuleSearchResult[]
}

/**
 * Merges the legacy subjects/curricula search with the newer topics/modules/bits
 * search. The legacy response's `topics` field is intentionally dropped: the new
 * endpoint's topic matches (title + summary full-text) supersede it, so keeping
 * both would produce a duplicate "Topics" group.
 */
export function combineHeaderSearch(
  searchLegacy: (query: string) => Promise<SearchResponse>,
  searchTopicsAndModules: (query: string) => Promise<TopicModuleSearchResult[]>,
) {
  return async (query: string): Promise<HeaderSearchResults> => {
    const [legacy, items] = await Promise.all([
      searchLegacy(query),
      searchTopicsAndModules(query),
    ])

    return {
      subjects: legacy.subjects,
      curricula: legacy.curricula,
      items,
    }
  }
}
