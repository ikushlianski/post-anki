import { useState } from 'react'

import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import {
  moveKnowledgeBitToInboxForReview,
  returnKnowledgeBitFromInboxForReview,
} from './knowledge-bit-inbox.api'
import {
  moveKnowledgeBitToChatQueueForReview,
  returnKnowledgeBitFromChatQueueForReview,
} from './knowledge-bit-chat-move.api'

type IdSet = ReadonlySet<string>

export function useInboxMoves({
  claimBit,
  releaseBit,
}: {
  claimBit: (bitId: string) => boolean
  releaseBit: (bitId: string) => void
}) {
  const [inboxedIds, setInboxedIds] = useState<IdSet>(new Set())
  const [chattedIds, setChattedIds] = useState<IdSet>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  function setError(bitId: string, message: string) {
    setErrors((prev) => ({ ...prev, [bitId]: message }))
  }

  async function run(
    bitId: string,
    failure: string,
    call: () => Promise<unknown>,
    setIds: (update: (prev: IdSet) => IdSet) => void,
    change: (ids: Set<string>) => void,
  ): Promise<boolean> {
    if (!claimBit(bitId)) {
      return false
    }

    setError(bitId, '')

    try {
      await call()
      setIds((prev) => {
        const ids = new Set(prev)

        change(ids)

        return ids
      })
      notifyPendingReviewChanged()

      return true
    } catch {
      setError(bitId, failure)

      return false
    } finally {
      releaseBit(bitId)
    }
  }

  function sendToInbox(bitId: string) {
    return run(
      bitId,
      "Couldn't send to Inbox. Try again.",
      () => moveKnowledgeBitToInboxForReview({ data: { bitId } }),
      setInboxedIds,
      (ids) => ids.add(bitId),
    )
  }

  function returnToTriage(bitId: string) {
    return run(
      bitId,
      "Couldn't undo. Try again.",
      () => returnKnowledgeBitFromInboxForReview({ data: { bitId } }),
      setInboxedIds,
      (ids) => ids.delete(bitId),
    )
  }

  function sendToChat(bitId: string) {
    return run(
      bitId,
      "Couldn't send to Chat. Try again.",
      () => moveKnowledgeBitToChatQueueForReview({ data: { bitId } }),
      setChattedIds,
      (ids) => ids.add(bitId),
    )
  }

  function returnFromChat(bitId: string) {
    return run(
      bitId,
      "Couldn't undo. Try again.",
      () => returnKnowledgeBitFromChatQueueForReview({ data: { bitId } }),
      setChattedIds,
      (ids) => ids.delete(bitId),
    )
  }

  return {
    inboxedIds,
    chattedIds,
    inboxErrors: errors,
    sendToInbox,
    returnToTriage,
    sendToChat,
    returnFromChat,
  }
}
