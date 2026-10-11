import { useCallback, useEffect, useState } from 'react'
import type { KnowledgeBitRejectReason } from '@post-anki/shared'

import type { RemovedBitSnapshot } from './knowledge-bit-review-sources'

export const WHY_STRIP_VISIBLE_MS = 10_000

export interface RejectionPrompt {
  bitId: string
  feedbackId: string | null
  snapshot: RemovedBitSnapshot
}

export interface RejectionWhyApi {
  setReason: (
    feedbackId: string,
    reasonCode: KnowledgeBitRejectReason,
    note?: string,
  ) => Promise<boolean>
  undo: (prompt: RejectionPrompt) => Promise<boolean>
}

export interface RejectionWhy {
  prompt: RejectionPrompt | null
  chosen: KnowledgeBitRejectReason | null
  note: string
  error: string | null
  show: (prompt: RejectionPrompt) => void
  choose: (reasonCode: KnowledgeBitRejectReason) => void
  changeNote: (note: string) => void
  commitNote: () => void
  undo: () => void
  dismiss: () => void
  keepOpen: () => void
}

export function useRejectionWhy(api: RejectionWhyApi): RejectionWhy {
  const [prompt, setPrompt] = useState<RejectionPrompt | null>(null)
  const [chosen, setChosen] = useState<KnowledgeBitRejectReason | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState(0)

  useEffect(() => {
    if (!prompt) {
      return
    }

    const timer = window.setTimeout(() => setPrompt(null), WHY_STRIP_VISIBLE_MS)

    return () => window.clearTimeout(timer)
  }, [prompt, activity])

  const keepOpen = useCallback(() => setActivity((count) => count + 1), [])

  const show = useCallback((next: RejectionPrompt) => {
    setPrompt(next)
    setChosen(null)
    setNote('')
    setError(null)
  }, [])

  async function save(reasonCode: KnowledgeBitRejectReason, text: string) {
    if (!prompt?.feedbackId) {
      return
    }

    const saved = await api.setReason(prompt.feedbackId, reasonCode, text.trim() || undefined)

    setError(saved ? null : "Couldn't save the reason.")
  }

  function choose(reasonCode: KnowledgeBitRejectReason) {
    keepOpen()
    setChosen(reasonCode)
    void save(reasonCode, note)
  }

  function changeNote(next: string) {
    keepOpen()
    setNote(next)
  }

  function commitNote() {
    if (chosen) {
      void save(chosen, note)
    }
  }

  function undo() {
    if (!prompt) {
      return
    }

    const current = prompt

    void api.undo(current).then((restored) => {
      if (restored) {
        setPrompt(null)
      } else {
        setError("Couldn't undo. Reload the page.")
      }
    })
  }

  return {
    prompt,
    chosen,
    note,
    error,
    show,
    choose,
    changeNote,
    commitNote,
    undo,
    dismiss: () => setPrompt(null),
    keepOpen,
  }
}
