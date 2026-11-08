import { useCallback, useRef, useState } from 'react'
import type { ChatQueueProposal } from '@post-anki/shared'

import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'
import { chatQueueFailureFromThrown, chatQueueFailureMessage } from './chat-queue-failure'
import { acceptChatQueueProposal, rejectChatQueueProposal } from './chat-queue.api'

export type ProposalDecision = 'accept' | 'reject'

export type ProposalStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'error'; message: string }

const IDLE: ProposalStatus = { state: 'idle' }

function keyOf(lineId: string, index: number): string {
  return `${lineId}:${index}`
}

interface Options {
  onDecided: (
    lineId: string,
    index: number,
    decision: Pick<ChatQueueProposal, 'status' | 'savedCardId'>,
  ) => void
  onRejected: () => void
}

export function useChatProposals(bitId: string, { onDecided, onRejected }: Options) {
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({})
  const inFlight = useRef(new Set<string>())

  const statusOf = useCallback(
    (lineId: string, index: number): ProposalStatus => statuses[keyOf(lineId, index)] ?? IDLE,
    [statuses],
  )

  const decide = useCallback(
    async (
      lineId: string,
      seq: number,
      proposal: ChatQueueProposal,
      decision: ProposalDecision,
    ) => {
      const key = keyOf(lineId, proposal.index)

      if (proposal.status !== 'pending' || inFlight.current.has(key)) {
        return
      }

      inFlight.current.add(key)

      const set = (status: ProposalStatus) => setStatuses((prev) => ({ ...prev, [key]: status }))

      set({ state: 'saving' })

      try {
        const call = decision === 'accept' ? acceptChatQueueProposal : rejectChatQueueProposal
        const outcome = await call({ data: { bitId, seq, index: proposal.index } })

        if (outcome.ok) {
          set(IDLE)
          onDecided(lineId, proposal.index, {
            status: outcome.data.status,
            ...(outcome.data.savedCardId ? { savedCardId: outcome.data.savedCardId } : {}),
          })

          if (decision === 'accept') {
            notifyPendingReviewChanged()
          } else {
            onRejected()
          }
        } else {
          set({ state: 'error', message: chatQueueFailureMessage(outcome.failure) })
        }
      } catch {
        set({ state: 'error', message: chatQueueFailureMessage(chatQueueFailureFromThrown()) })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [bitId, onDecided, onRejected],
  )

  return { statusOf, decide }
}
