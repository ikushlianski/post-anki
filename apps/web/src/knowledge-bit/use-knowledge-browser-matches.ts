import { useQuery } from '@tanstack/react-query'
import type { KnowledgeBitBrowserFilters, KnowledgeBitBrowserMatch } from '@post-anki/shared'

import { getKnowledgeBrowserMatches } from './knowledge-browser-matches.api'
import { isDateRangeReversed, toApiFilters } from './knowledge-browser-filters'
import { KNOWLEDGE_BROWSER_QUERY_KEY } from './use-knowledge-browser-data'

const NO_ITEMS: KnowledgeBitBrowserMatch[] = []

export type BrowserMatchesStatus = 'off' | 'blocked' | 'pending' | 'error' | 'success'

export function useKnowledgeBrowserMatches(
  words: string | undefined,
  subjectId: string | null,
  filters: KnowledgeBitBrowserFilters = {},
) {
  const reversed = isDateRangeReversed(filters)
  const active = Boolean(words)
  const apiFilters = toApiFilters(filters)
  const query = useQuery({
    queryKey: [...KNOWLEDGE_BROWSER_QUERY_KEY, 'matches', words ?? '', subjectId ?? '', filters],
    enabled: active && !reversed,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const outcome = await getKnowledgeBrowserMatches({
        data: { q: words ?? '', ...apiFilters, ...(subjectId ? { subjectId } : {}) },
      })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome
    },
  })

  const status: BrowserMatchesStatus = !active
    ? 'off'
    : reversed
      ? 'blocked'
      : query.isError && !query.isFetching
        ? 'error'
        : query.data
          ? 'success'
          : 'pending'

  return {
    active,
    status,
    rows: query.data?.items ?? NO_ITEMS,
    readyCount: query.data?.readyCount ?? 0,
    notReadyCount: query.data?.notReadyCount ?? 0,
    capped: query.data?.capped ?? false,
    errorCode: query.isError && !query.isFetching ? query.error.message : null,
    retry: () => void query.refetch(),
  }
}

export type BrowserMatches = ReturnType<typeof useKnowledgeBrowserMatches>
