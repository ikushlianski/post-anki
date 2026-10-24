import { useEffect, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { listKnowledgeOverview } from './knowledge-overview.api'
import type { KnowledgeOverviewOutcome } from './knowledge-overview.api'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250

export const KNOWLEDGE_BITS_QUERY_KEY = ['knowledge-bits'] as const

type OverviewPage = Extract<KnowledgeOverviewOutcome, { ok: true }>

export function useKnowledgeOverviewData() {
  const queryClient = useQueryClient()
  const [subjectId, setSubjectId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [search])

  const queryKey = [...KNOWLEDGE_BITS_QUERY_KEY, 'overview', subjectId, debouncedSearch] as const

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<OverviewPage> => {
      const outcome = await listKnowledgeOverview({
        data: {
          limit: PAGE_SIZE,
          offset: pageParam,
          ...(subjectId ? { subjectId } : {}),
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
        },
      })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome
    },
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length * PAGE_SIZE : undefined),
  })

  const rows: KnowledgeBitOverviewItem[] = (query.data?.pages ?? []).flatMap((page) => page.items)

  function removeRows(ids: ReadonlySet<string>) {
    queryClient.setQueryData<InfiniteData<OverviewPage>>(
      queryKey,
      (previous) =>
        previous && {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => !ids.has(item.knowledgeBitId)),
          })),
        },
    )
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_BITS_QUERY_KEY })
  }

  return {
    rows,
    subjectId,
    setSubjectId,
    search,
    setSearch,
    isPending: query.isPending,
    isError: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    removeRows,
    refresh,
    retry: () => void query.refetch(),
  }
}
