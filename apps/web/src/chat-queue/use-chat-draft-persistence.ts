import { useEffect, useRef } from 'react'

import { flushChatDraft, scheduleChatDraftSave } from './chat-queue-draft-storage'

const SAVE_DEBOUNCE_MS = 300

export function useChatDraftPersistence(cardId: string, draft: string) {
  const latest = useRef({ cardId, draft })

  latest.current = { cardId, draft }

  useEffect(() => {
    scheduleChatDraftSave(cardId, draft, SAVE_DEBOUNCE_MS)
  }, [cardId, draft])

  useEffect(() => {
    const flush = () => flushChatDraft(latest.current.cardId, latest.current.draft)

    window.addEventListener('pagehide', flush)

    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])
}
