import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useState } from 'react'

import { sendRejectedDecisionToChat } from '../card-triage/triage-send-to-chat'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import type { RejectedCardsOutcome } from './rejected-knowledge-bits.api'

type RejectedPage = Extract<RejectedCardsOutcome, { ok: true }>
type RejectedData = InfiniteData<RejectedPage, number>

const QUERY_KEY = ['knowledge-bits', 'rejected']

function withoutCard(data: RejectedData | undefined, bitId: string, reasonCode: string) {
  if (!data) {
    return data
  }

  return {
    ...data,
    pages: data.pages.map((page, index) => {
      const count = page.reasonCounts?.[reasonCode]

      return {
        ...page,
        items: page.items.filter((item) => item.knowledgeBitId !== bitId),
        ...(index === 0 && page.reasonCounts && count !== undefined
          ? { reasonCounts: { ...page.reasonCounts, [reasonCode]: Math.max(0, count - 1) } }
          : {}),
      }
    }),
  }
}

function add(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return new Set(set).add(id)
}

function remove(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)

  next.delete(id)

  return next
}

export function useRejectedSendToChat() {
  const queryClient = useQueryClient()
  const [sendingIds, setSendingIds] = useState<ReadonlySet<string>>(new Set())
  const [chatFailedIds, setChatFailedIds] = useState<ReadonlySet<string>>(new Set())

  async function sendToChat(bitId: string, reasonCode: string): Promise<void> {
    const snapshots = queryClient.getQueriesData<RejectedData>({ queryKey: QUERY_KEY })

    setChatFailedIds((prev) => remove(prev, bitId))
    setSendingIds((prev) => add(prev, bitId))
    queryClient.setQueriesData<RejectedData>({ queryKey: QUERY_KEY }, (data) =>
      withoutCard(data, bitId, reasonCode),
    )

    const ok = await sendRejectedDecisionToChat(bitId)

    setSendingIds((prev) => remove(prev, bitId))

    if (ok) {
      notifyPendingReviewChanged()

      return
    }

    for (const [key, data] of snapshots) {
      queryClient.setQueryData(key, data)
    }

    setChatFailedIds((prev) => add(prev, bitId))
  }

  return { sendingIds, chatFailedIds, sendToChat }
}
