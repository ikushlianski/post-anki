import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { KnowledgeBitBrowserFilters, KnowledgeBitBrowserItem } from '@post-anki/shared'

import { listKnowledgeBrowser, listKnowledgeBrowserSubjectCounts } from './knowledge-browser.api'
import type { KnowledgeBrowserOutcome } from './knowledge-browser.api'
import { isDateRangeReversed, toApiFilters } from './knowledge-browser-filters'

const PAGE_SIZE = 50

export const KNOWLEDGE_BROWSER_QUERY_KEY = ['knowledge-bits', 'browser'] as const

type BrowserPage = Extract<KnowledgeBrowserOutcome, { ok: true }>

export function useKnowledgeBrowserRows(
  subjectId: string | null,
  filters: KnowledgeBitBrowserFilters = {},
) {
  const apiFilters = toApiFilters(filters)
  const query = useInfiniteQuery({
    queryKey: [...KNOWLEDGE_BROWSER_QUERY_KEY, 'rows', subjectId ?? '', filters],
    enabled: !isDateRangeReversed(filters),
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<BrowserPage> => {
      const outcome = await listKnowledgeBrowser({
        data: { limit: PAGE_SIZE, offset: pageParam, ...apiFilters, ...(subjectId ? { subjectId } : {}) },
      })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length * PAGE_SIZE : undefined),
  })

  const rows: KnowledgeBitBrowserItem[] = (query.data?.pages ?? []).flatMap((page) => page.items)

  return {
    rows,
    total: query.data?.pages.at(-1)?.total ?? null,
    isPending: query.isPending && query.fetchStatus !== 'idle',
    isError: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    retry: () => void query.refetch(),
  }
}

export function useKnowledgeBrowserSubjectCounts() {
  const query = useQuery({
    queryKey: [...KNOWLEDGE_BROWSER_QUERY_KEY, 'counts'],
    queryFn: async () => {
      const outcome = await listKnowledgeBrowserSubjectCounts()

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.counts
    },
  })

  return {
    counts: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    retry: () => void query.refetch(),
  }
}
