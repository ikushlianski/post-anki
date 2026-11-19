import { useRef, useState } from 'react'
import type { ReviewCard } from '@post-anki/shared'

import { moveKnowledgeBitToSubjectForReview } from './knowledge-bit-subject-move.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { recordRecentMoveTarget } from './recent-move-targets'

export const MOVE_OFFLINE_MESSAGE = 'Moving a card needs a connection. Try again when you are back online.'

const SKIP_MESSAGES: Record<string, string> = {
  curriculum_placed: 'This card is part of a course, so it stays in the course subject.',
  not_approved: 'This card is not approved yet, so it cannot be moved.',
}

const FAILED_MESSAGE = "Couldn't move the card. Try again."

interface Input {
  current: ReviewCard | null
  online: boolean
  advanceWith: (notice: string, save: () => Promise<boolean>) => Promise<boolean>
}

export function useReviewCardMove({ current, online, advanceWith }: Input) {
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function move(subjectId: string, label: string) {
    if (!current || inFlight.current) {
      return false
    }

    if (!online) {
      setMoveError(MOVE_OFFLINE_MESSAGE)

      return false
    }

    inFlight.current = true
    setMoving(true)
    setMoveError(null)

    try {
      return await advanceWith(`Moved to ${label}`, async () => {
        try {
          const outcome = await moveKnowledgeBitToSubjectForReview({
            data: { bitId: current.knowledgeBitId, subjectId },
          })

          if (!outcome.moved.includes(current.knowledgeBitId)) {
            const reason = outcome.skipped[0]?.reason ?? ''

            setMoveError(SKIP_MESSAGES[reason] ?? FAILED_MESSAGE)

            return false
          }

          recordRecentMoveTarget(subjectId)
          notifyPendingReviewChanged()

          return true
        } catch {
          setMoveError(FAILED_MESSAGE)

          return false
        }
      })
    } catch {
      setMoveError(FAILED_MESSAGE)

      return false
    } finally {
      inFlight.current = false
      setMoving(false)
    }
  }

  return { moving, moveError, move, clearMoveError: () => setMoveError(null) }
}
