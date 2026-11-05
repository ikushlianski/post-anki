import { useCallback, useRef, useState } from 'react'
import type { RelatedCardSuggestion } from '@post-anki/shared'

import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'
import { chatQueueFailureFromThrown, chatQueueFailureMessage } from './chat-queue-failure'
import { createCardFromChatMessage } from './chat-queue.api'

export type ProposalStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'approved' }
  | { state: 'error'; message: string }

const IDLE: ProposalStatus = { state: 'idle' }

function keyOf(lineId: string, index: number): string {
  return `${lineId}:${index}`
}

export function useChatProposals(bitId: string) {
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({})
  const inFlight = useRef(new Set<string>())

  const statusOf = useCallback(
    (lineId: string, index: number): ProposalStatus => statuses[keyOf(lineId, index)] ?? IDLE,
    [statuses],
  )

  const approve = useCallback(
    async (lineId: string, seq: number, index: number, proposal: RelatedCardSuggestion) => {
      const key = keyOf(lineId, index)
      const current = statuses[key]?.state

      if (inFlight.current.has(key) || current === 'saving' || current === 'approved') {
        return
      }

      inFlight.current.add(key)

      const set = (status: ProposalStatus) => setStatuses((prev) => ({ ...prev, [key]: status }))

      set({ state: 'saving' })

      try {
        const outcome = await createCardFromChatMessage({
          data: {
            bitId,
            seq,
            card: {
              front: proposal.front,
              back: proposal.back,
              ...(proposal.example ? { example: proposal.example } : {}),
              approve: true,
            },
          },
        })

        if (outcome.ok) {
          set({ state: 'approved' })
          notifyPendingReviewChanged()
        } else {
          set({ state: 'error', message: chatQueueFailureMessage(outcome.failure) })
        }
      } catch {
        set({ state: 'error', message: chatQueueFailureMessage(chatQueueFailureFromThrown()) })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [bitId, statuses],
  )

  return { statusOf, approve }
}
