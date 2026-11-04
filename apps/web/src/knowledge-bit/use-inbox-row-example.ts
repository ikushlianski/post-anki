import { useState } from 'react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import { exampleErrorMessage } from './knowledge-bit-example-messages'
import { generateKnowledgeBitExampleForReview } from './knowledge-bit-inbox.api'
import { editKnowledgeBitForReview } from './knowledge-bit-review.api'

export interface InboxExampleUndo {
  previous: string | null
}

export function useInboxRowExample(
  item: InboxKnowledgeBit,
  onChange: (change: Pick<InboxKnowledgeBit, 'background' | 'exampleAiGeneratedAt'>) => void,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<InboxExampleUndo | null>(null)

  async function generate() {
    const hasHumanText = Boolean(item.background?.trim()) && !item.exampleAiGeneratedAt

    if (busy || (hasHumanText && !window.confirm('Replace the example you wrote with an AI example?'))) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const outcome = await generateKnowledgeBitExampleForReview({
        data: { bitId: item.id, overwrite: hasHumanText },
      })

      if (!outcome.ok) {
        setError(exampleErrorMessage(outcome.error))

        return
      }

      setUndo({ previous: outcome.data.previousExample })
      onChange({
        background: outcome.data.example,
        exampleAiGeneratedAt: outcome.data.exampleAiGeneratedAt,
      })
    } catch {
      setError(exampleErrorMessage('generation_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function undoExample() {
    if (busy || !undo) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await editKnowledgeBitForReview({
        data: { bitId: item.id, body: item.body, background: undo.previous },
      })
      setUndo(null)
      onChange({ background: undo.previous, exampleAiGeneratedAt: null })
    } catch {
      setError("Couldn't undo. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, canUndo: undo !== null, generate, undoExample }
}
