import { useCallback, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  discardKnowledgeSourceForReview,
  getPendingKnowledgeBitsWithAttentionForReview,
} from './knowledge-bit-review.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import type { RegenerationStatuses } from './knowledge-bit-review-regeneration'

export function splitAttentionSources(sources: PendingKnowledgeSourceForReview[]) {
  return {
    cards: sources.filter((source) => source.bits.length > 0 || !source.attention),
    notices: sources.filter((source) => source.attention),
  }
}

export function useAttentionNotices({
  initial,
  clearRetryState,
}: {
  initial: PendingKnowledgeSourceForReview[]
  clearRetryState: (sourceId: string) => void
}) {
  const [notices, setNotices] = useState(initial)
  const noticesRef = useRef(notices)
  const clearRef = useRef(clearRetryState)

  noticesRef.current = notices
  clearRef.current = clearRetryState

  const discard = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      await discardKnowledgeSourceForReview({ data: { sourceId } })
      setNotices((prev) => prev.filter((notice) => notice.knowledgeSourceId !== sourceId))
      notifyPendingReviewChanged()

      return true
    } catch {
      return false
    }
  }, [])

  const reloadAfterRetry = useCallback(async (statuses: RegenerationStatuses) => {
    const finished = noticesRef.current
      .map((notice) => notice.knowledgeSourceId)
      .filter((id) => statuses[id]?.status === 'done' || statuses[id]?.status === 'failed')

    if (finished.length === 0) {
      return
    }

    const fresh = await getPendingKnowledgeBitsWithAttentionForReview()

    setNotices(fresh.filter((source) => source.attention))
    finished.forEach((id) => clearRef.current(id))
    notifyPendingReviewChanged()
  }, [])

  return { notices, discard, reloadAfterRetry }
}
