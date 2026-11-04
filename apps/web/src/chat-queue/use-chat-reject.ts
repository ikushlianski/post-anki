import { useCallback, useState, type MutableRefObject } from 'react'
import type { KnowledgeBitRejectReason } from '@post-anki/shared'

import type { ChatQueueFailureKind } from './chat-queue-failure'
import { rejectFromChatQueue, saveChatQueueRejectReason } from './chat-queue.api'
import { settle } from './chat-thread-state'

export function useChatReject(
  itemId: string,
  busy: MutableRefObject<boolean>,
  handle: (failure: ChatQueueFailureKind) => void,
  onResolved: (id: string) => void,
  setResolving: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  const [rejectFeedbackId, setRejectFeedbackId] = useState<string | null>(null)

  const reject = useCallback(async () => {
    if (busy.current) {
      return
    }

    busy.current = true
    setResolving(true)
    setError(null)

    const outcome = await settle(() => rejectFromChatQueue({ data: { bitId: itemId } }))

    if (!outcome.ok) {
      handle(outcome.failure)
    } else if (outcome.data.feedbackId) {
      setRejectFeedbackId(outcome.data.feedbackId)
    } else {
      onResolved(itemId)
    }

    setResolving(false)
    busy.current = false
  }, [busy, handle, itemId, onResolved, setError, setResolving])

  const sendRejectReason = useCallback(
    async (reason: KnowledgeBitRejectReason, note: string) => {
      if (!rejectFeedbackId) {
        return
      }

      const trimmed = note.trim()
      const outcome = await settle(() =>
        saveChatQueueRejectReason({
          data: {
            feedbackId: rejectFeedbackId,
            reasonCode: reason,
            ...(trimmed ? { note: trimmed } : {}),
          },
        }),
      )

      if (outcome.ok) {
        onResolved(itemId)
      } else {
        setError("Couldn't save the reason. Try again or skip.")
      }
    },
    [itemId, onResolved, rejectFeedbackId, setError],
  )

  const skipRejectReason = useCallback(() => onResolved(itemId), [itemId, onResolved])

  return { rejecting: rejectFeedbackId !== null, reject, sendRejectReason, skipRejectReason }
}
