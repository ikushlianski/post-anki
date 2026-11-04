import { useCallback, useState } from 'react'

import { chatQueueFailureFromThrown, chatQueueFailureMessage } from './chat-queue-failure'
import { createCardFromChatMessage } from './chat-queue.api'

export interface CardDraft {
  seq: number
  front: string
  back: string
}

export function useChatCard(bitId: string, lockedByParent: boolean) {
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSeqs, setSavedSeqs] = useState<number[]>([])

  const open = useCallback((seq: number, back: string) => {
    setError(null)
    setDraft({ seq, front: '', back })
  }, [])

  const cancel = useCallback(() => {
    setError(null)
    setDraft(null)
  }, [])

  const edit = useCallback((patch: Partial<Pick<CardDraft, 'front' | 'back'>>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const save = useCallback(async () => {
    const front = draft?.front.trim() ?? ''
    const back = draft?.back.trim() ?? ''

    if (!draft || saving || lockedByParent || !front || !back) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const outcome = await createCardFromChatMessage({
        data: { bitId, seq: draft.seq, card: { front, back } },
      })

      if (outcome.ok) {
        setSavedSeqs((prev) => [...prev, draft.seq])
        setDraft(null)
      } else {
        setError(chatQueueFailureMessage(outcome.failure))
      }
    } catch {
      setError(chatQueueFailureMessage(chatQueueFailureFromThrown()))
    }

    setSaving(false)
  }, [bitId, draft, lockedByParent, saving])

  return { draft, saving, error, savedSeqs, open, cancel, edit, save }
}
