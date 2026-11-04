import { useCallback, useState, type MutableRefObject } from 'react'
import type { DeleteLastChatExchangeResult } from '@post-anki/shared'

import {
  chatQueueFailureFromThrown,
  type ChatQueueFailureKind,
  type ChatQueueOutcome,
} from './chat-queue-failure'
import { deleteLastChatExchange } from './chat-queue.api'

export function useChatDeleteLast(
  bitId: string,
  busy: MutableRefObject<boolean>,
  onFailure: (failure: ChatQueueFailureKind) => void,
  onDeleted: (result: DeleteLastChatExchangeResult) => void,
) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const ask = useCallback(() => setConfirming(true), [])
  const cancel = useCallback(() => setConfirming(false), [])

  const confirm = useCallback(async () => {
    if (busy.current) {
      return
    }

    busy.current = true
    setDeleting(true)

    let outcome: ChatQueueOutcome<DeleteLastChatExchangeResult>

    try {
      outcome = await deleteLastChatExchange({ data: { bitId } })
    } catch {
      outcome = { ok: false, failure: chatQueueFailureFromThrown() }
    }

    if (outcome.ok) {
      onDeleted(outcome.data)
    } else {
      onFailure(outcome.failure)
    }

    setConfirming(false)
    setDeleting(false)
    busy.current = false
  }, [bitId, busy, onDeleted, onFailure])

  return { confirming, deleting, ask, cancel, confirm }
}
