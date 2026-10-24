import { useCallback, useEffect, useRef, useState } from 'react'
import type { KnowledgeBitRejectReason } from '@post-anki/shared'

import { DECISION_STRIP_VISIBLE_MS } from './knowledge-bit-review-decision-feedback'

export interface RejectionPrompt {
  bitId: string
  feedbackId: string | null
  mode: 'rejected' | 'grade'
}

export interface RejectionWhyApi {
  updateFeedback: (
    feedbackId: string,
    data: { reasonCode?: KnowledgeBitRejectReason; note?: string; rating?: number },
  ) => Promise<boolean>
  grade: (bitId: string, data: { rating: number; note?: string }) => Promise<string | null>
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
  chooseQuality: (rating: number) => void
  dismiss: () => void
  keepOpen: () => void
}

export function useRejectionWhy(api: RejectionWhyApi): RejectionWhy {
  const [prompt, setPrompt] = useState<RejectionPrompt | null>(null)
  const [chosen, setChosen] = useState<KnowledgeBitRejectReason | null>(null)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState(0)

  const gradingRef = useRef(false)
  const promptRef = useRef(prompt)
  promptRef.current = prompt
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen
  const noteRef = useRef(note)
  noteRef.current = note
  const noteSavedRef = useRef(noteSaved)
  noteSavedRef.current = noteSaved

  useEffect(() => {
    if (!prompt) {
      return
    }

    if (!noteSaved && note.trim()) {
      return
    }

    const timer = window.setTimeout(() => setPrompt(null), DECISION_STRIP_VISIBLE_MS)

    return () => window.clearTimeout(timer)
  }, [prompt, activity, note, noteSaved])

  const keepOpen = useCallback(() => setActivity((count) => count + 1), [])

  async function update(
    data: { reasonCode?: KnowledgeBitRejectReason; note?: string; rating?: number },
    forFeedbackId: string,
  ) {
    const saved = await api.updateFeedback(forFeedbackId, data)

    if (promptRef.current?.feedbackId === forFeedbackId) {
      setError(saved ? null : "Couldn't save.")
    }
  }

  const show = useCallback(
    (next: RejectionPrompt) => {
      const currentNote = noteRef.current
      const currentChosen = chosenRef.current
      const currentFeedbackId = promptRef.current?.feedbackId
      const currentNoteSaved = noteSavedRef.current

      if (!currentNoteSaved && currentNote.trim() && currentFeedbackId) {
        void update(
          currentChosen ? { reasonCode: currentChosen, note: currentNote } : { note: currentNote },
          currentFeedbackId,
        )
      }

      setPrompt(next)
      setChosen(null)
      setNote('')
      setNoteSaved(true)
      setError(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function choose(reasonCode: KnowledgeBitRejectReason) {
    if (!promptRef.current?.feedbackId) {
      return
    }

    keepOpen()
    setChosen(reasonCode)
    void update({ reasonCode }, promptRef.current.feedbackId)
  }

  function changeNote(next: string) {
    keepOpen()
    setNote(next)
    setNoteSaved(false)
  }

  function commitNote() {
    if (!promptRef.current?.feedbackId) {
      return
    }

    const currentNote = noteRef.current
    const currentReason = chosenRef.current
    const feedbackId = promptRef.current.feedbackId

    setNoteSaved(true)
    void update(
      currentReason ? { reasonCode: currentReason, note: currentNote } : { note: currentNote },
      feedbackId,
    )
  }

  async function gradeNew(bitId: string, rating: number) {
    if (gradingRef.current) {
      return
    }

    gradingRef.current = true

    const pendingNote = noteRef.current.trim()

    try {
      const feedbackId = await api.grade(
        bitId,
        pendingNote ? { rating, note: pendingNote } : { rating },
      )
      const current = promptRef.current

      if (current?.bitId !== bitId) {
        return
      }

      if (!feedbackId) {
        setError("Couldn't save.")

        return
      }

      setError(null)
      setPrompt({ ...current, feedbackId })

      if (pendingNote && noteRef.current.trim() === pendingNote) {
        setNoteSaved(true)
      }
    } finally {
      gradingRef.current = false
    }
  }

  function chooseQuality(rating: number) {
    const current = promptRef.current

    if (!current) {
      return
    }

    keepOpen()

    if (current.feedbackId) {
      void update({ rating }, current.feedbackId)
    } else {
      void gradeNew(current.bitId, rating)
    }
  }

  function dismiss() {
    if (!noteSavedRef.current && noteRef.current.trim() && promptRef.current?.feedbackId) {
      commitNote()
    }

    setPrompt(null)
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
    chooseQuality,
    dismiss,
    keepOpen,
  }
}
