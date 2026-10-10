import { useState } from 'react'
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { SuspendedCard } from '@post-anki/shared'

import { updateCardSchedule } from './anki-review.api'
import { SuspendedCardsPage, type SuspendedCardRowState } from './suspended-cards-page'
import { listSuspendedKnowledgeBits, type SuspendedCardsOutcome } from './suspended-knowledge-bits.api'

const PAGE_SIZE = 50
const SUSPENDED_QUERY_KEY = ['knowledge-bits', 'suspended'] as const

type SuspendedPage = Extract<SuspendedCardsOutcome, { ok: true }>

export function SuspendedCardsScreen() {
  const queryClient = useQueryClient()
  const [rowStates, setRowStates] = useState<Record<string, SuspendedCardRowState>>({})

  const query = useInfiniteQuery({
    queryKey: SUSPENDED_QUERY_KEY,
    queryFn: async ({ pageParam }): Promise<SuspendedPage> => {
      const outcome = await listSuspendedKnowledgeBits({
        data: { limit: PAGE_SIZE, offset: pageParam },
      })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * PAGE_SIZE : undefined,
  })

  function setRowState(knowledgeBitId: string, state: SuspendedCardRowState | null) {
    setRowStates((previous) => {
      const next = { ...previous }

      if (state) {
        next[knowledgeBitId] = state
      } else {
        delete next[knowledgeBitId]
      }

      return next
    })
  }

  function dropFromCache(knowledgeBitId: string) {
    queryClient.setQueryData<InfiniteData<SuspendedPage>>(SUSPENDED_QUERY_KEY, (previous) =>
      previous && {
        ...previous,
        pages: previous.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.knowledgeBitId !== knowledgeBitId),
        })),
      },
    )
  }

  async function bringBack(card: SuspendedCard) {
    const { knowledgeBitId } = card

    setRowState(knowledgeBitId, { pending: true, failed: false })

    let succeeded = false

    try {
      const outcome = await updateCardSchedule({
        data: {
          knowledgeBitId,
          ...(card.suspended ? { suspended: false } : {}),
          ...(card.buriedUntil ? { buried: false } : {}),
        },
      })

      succeeded = outcome.ok
    } catch {
      succeeded = false
    }

    if (!succeeded) {
      setRowState(knowledgeBitId, { pending: false, failed: true })

      return
    }

    setRowState(knowledgeBitId, null)
    dropFromCache(knowledgeBitId)
    void queryClient.invalidateQueries({ queryKey: SUSPENDED_QUERY_KEY })
  }

  if (query.isPending) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p data-testid="suspended-cards-loading" className="text-neutral-500">
          Loading…
        </p>
      </main>
    )
  }

  if (query.isError) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p role="alert" data-testid="suspended-cards-error" className="text-red-700">
          Could not load suspended cards.
        </p>
      </main>
    )
  }

  const cards = (query.data?.pages ?? []).flatMap((page) => page.items)

  return (
    <SuspendedCardsPage
      cards={cards}
      rowStates={rowStates}
      hasMore={query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onBringBack={(card) => void bringBack(card)}
      onLoadMore={() => void query.fetchNextPage()}
    />
  )
}
