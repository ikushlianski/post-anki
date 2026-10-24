import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { getPendingKnowledgeBitsForReview } from './knowledge-bit-review.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import {
  REGENERATION_POLL_INTERVAL_MS,
  type useSourceRegeneration,
} from './knowledge-bit-review-regeneration'
import {
  QUESTION_POLL_IDLE_LIMIT,
  hasBitAwaitingQuestions,
  mergeArrivedBits,
  mergeArrivedVariants,
  REGENERATION_POLL_MAX_ATTEMPTS,
  unseenBitIds,
  useQuestionPolling,
} from './knowledge-bit-review-polling'
import { REVIEW_REFRESH_REQUESTED_EVENT } from './knowledge-bit-review-events'

export function useReviewRefresh({
  sources,
  setSources,
  knownBitIds,
  editingBitIds,
  rowErrors,
  regeneration,
}: {
  sources: PendingKnowledgeSourceForReview[]
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  knownBitIds: MutableRefObject<Set<string>>
  editingBitIds: MutableRefObject<Set<string>>
  rowErrors: Record<string, string>
  regeneration: ReturnType<typeof useSourceRegeneration>
}) {
  const [idleStopped, setIdleStopped] = useState(false)
  const [failureCount, setFailureCount] = useState(0)
  const [restartToken, setRestartToken] = useState(0)
  const quietPolls = useRef(0)
  const { fetchStatuses, applyStatuses } = regeneration

  const refreshQuestions = useCallback(async () => {
    const statuses = await fetchStatuses()
    const fresh = await getPendingKnowledgeBitsForReview()
    const arrived = new Set(unseenBitIds(fresh, knownBitIds.current))
    const protectedBitIds = new Set([
      ...editingBitIds.current,
      ...Object.keys(rowErrors).filter((bitId) => rowErrors[bitId]),
    ])

    arrived.forEach((bitId) => knownBitIds.current.add(bitId))

    if (arrived.size > 0) {
      notifyPendingReviewChanged()
    }
    quietPolls.current = arrived.size > 0 ? 0 : quietPolls.current + 1
    setIdleStopped(quietPolls.current >= QUESTION_POLL_IDLE_LIMIT)
    setSources((prev) =>
      mergeArrivedBits(mergeArrivedVariants(prev, fresh, protectedBitIds), fresh, arrived),
    )
    applyStatuses(statuses, fresh)
  }, [rowErrors, fetchStatuses, applyStatuses, knownBitIds, editingBitIds, setSources])

  const trackedRefresh = useCallback(async () => {
    try {
      await refreshQuestions()
      setFailureCount(0)
    } catch (error) {
      setFailureCount((count) => count + 1)
      throw error
    }
  }, [refreshQuestions])

  const pollingGaveUp = useQuestionPolling(
    hasBitAwaitingQuestions(sources) || !idleStopped || regeneration.isRegenerating,
    trackedRefresh,
    regeneration.isRegenerating ? REGENERATION_POLL_INTERVAL_MS : undefined,
    regeneration.isRegenerating ? REGENERATION_POLL_MAX_ATTEMPTS : undefined,
    restartToken,
  )

  const checkNow = useCallback(() => {
    quietPolls.current = 0
    setIdleStopped(false)
    setFailureCount(0)
    setRestartToken((token) => token + 1)
    void trackedRefresh().catch(() => undefined)
  }, [trackedRefresh])

  const handleEditingChange = useCallback(
    (bitId: string, editing: boolean) => {
      if (editing) {
        editingBitIds.current.add(bitId)
      } else {
        editingBitIds.current.delete(bitId)
      }
    },
    [editingBitIds],
  )

  useEffect(() => {
    const handler = () => { checkNow() }

    window.addEventListener(REVIEW_REFRESH_REQUESTED_EVENT, handler)

    return () => { window.removeEventListener(REVIEW_REFRESH_REQUESTED_EVENT, handler) }
  }, [checkNow])

  return { pollingGaveUp, idleStopped, failureCount, checkNow, handleEditingChange }
}
