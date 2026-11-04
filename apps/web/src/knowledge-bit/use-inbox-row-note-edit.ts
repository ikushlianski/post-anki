import { useState } from 'react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import { editKnowledgeBitNoteForReview } from './knowledge-bit-review.api'
import { draftNote } from './knowledge-bit-review-note-edit'

export function useInboxRowNoteEdit(
  item: InboxKnowledgeBit,
  onChange: (change: Pick<InboxKnowledgeBit, 'body' | 'cardCount' | 'note'>) => void,
) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open() {
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
  }

  async function save(text: string) {
    const note = item.note
    const draft = note ? draftNote(note.mode, text) : null

    if (!note || !draft || draft.problem !== null || busy) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await editKnowledgeBitNoteForReview({
        data: { variantId: note.variantId, text, mode: note.mode },
      })

      onChange({
        body: draft.body,
        cardCount: result.cards.length,
        note: { variantId: result.cards[0]?.id ?? result.variantId, mode: note.mode, text: draft.sentence },
      })
      setEditing(false)
    } catch {
      setError("Couldn't save your changes. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return { editing, busy, error, open, cancel, save }
}
