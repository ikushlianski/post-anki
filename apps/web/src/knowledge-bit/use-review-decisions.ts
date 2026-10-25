import { useRef, useState, type MutableRefObject } from 'react'

import {
  approveKnowledgeBitForReview,
  rejectKnowledgeBitForReview,
  triageKnowledgeBitForReview,
  undoTriageKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'

export interface ReviewDecision {
  verdict: 'approved' | 'rejected'
  feedbackId: string | null
  triaged?: boolean
  droppedVariantIds?: string[]
}

export type ReviewDecisions = Record<string, ReviewDecision>

export function useReviewDecisions({
  knownBitIds,
  claimBit,
  releaseBit,
  onDecided,
  onUndone,
}: {
  knownBitIds: MutableRefObject<Set<string>>
  claimBit: (bitId: string) => boolean
  releaseBit: (bitId: string) => void
  onDecided?: (bitId: string, decision: ReviewDecision) => void
  onUndone?: (bitId: string) => void
}) {
  const callbacks = useRef({ onDecided, onUndone })

  callbacks.current = { onDecided, onUndone }

  const [decisions, setDecisions] = useState<ReviewDecisions>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const decidedStack = useRef<string[]>([])

  function setRowError(bitId: string, message: string | null) {
    setRowErrors((prev) => ({ ...prev, [bitId]: message ?? '' }))
  }

  function markApproved(bitIds: string[]) {
    bitIds.forEach((bitId) => knownBitIds.current.add(bitId))
    setDecisions((prev) => ({
      ...prev,
      ...Object.fromEntries(
        bitIds.map((bitId) => [bitId, { verdict: 'approved', feedbackId: null } as const]),
      ),
    }))
  }

  async function decide(
    bitId: string,
    failure: string,
    run: () => Promise<ReviewDecision>,
  ): Promise<ReviewDecision | undefined> {
    if (!claimBit(bitId)) {
      return undefined
    }

    setRowError(bitId, null)

    try {
      const decision = await run()

      knownBitIds.current.add(bitId)
      decidedStack.current = [...decidedStack.current.filter((id) => id !== bitId), bitId]
      callbacks.current.onDecided?.(bitId, decision)
      setDecisions((prev) => ({ ...prev, [bitId]: decision }))
      notifyPendingReviewChanged()

      return decision
    } catch {
      setRowError(bitId, failure)

      return undefined
    } finally {
      releaseBit(bitId)
    }
  }

  function approve(bitId: string) {
    return decide(bitId, "Couldn't approve. Try again.", async () => {
      await approveKnowledgeBitForReview({ data: { bitId } })

      return { verdict: 'approved', feedbackId: null }
    })
  }

  function keepVariants(bitId: string, keepVariantIds: string[]) {
    return decide(bitId, "Couldn't keep. Try again.", async () => {
      const result = await triageKnowledgeBitForReview({ data: { bitId, keepVariantIds } })

      return {
        verdict: 'approved',
        feedbackId: null,
        triaged: true,
        droppedVariantIds: result.droppedVariantIds,
      }
    })
  }

  function reject(bitId: string) {
    return decide(bitId, "Couldn't reject. Try again.", async () => {
      const result = await rejectKnowledgeBitForReview({ data: { bitId } })

      return { verdict: 'rejected', feedbackId: result.feedbackId }
    })
  }

  async function undo(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    setRowError(bitId, null)

    try {
      const decision = decisions[bitId]

      if (decision?.triaged) {
        await undoTriageKnowledgeBitForReview({
          data: { bitId, restoreVariantIds: decision.droppedVariantIds ?? [] },
        })
      } else {
        await restoreKnowledgeBitForReview({ data: { bitId } })
      }

      decidedStack.current = decidedStack.current.filter((id) => id !== bitId)
      callbacks.current.onUndone?.(bitId)

      setDecisions((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id]) => id !== bitId)),
      )
      notifyPendingReviewChanged()
    } catch {
      setRowError(bitId, "Couldn't undo. Try again.")
    } finally {
      releaseBit(bitId)
    }
  }

  function undoLast() {
    const bitId = [...decidedStack.current].reverse().find((id) => decisions[id])

    if (bitId) {
      return undo(bitId)
    }
  }

  return { decisions, rowErrors, approve, keepVariants, reject, undo, undoLast, markApproved }
}
