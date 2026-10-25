import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getKnowledgeSourceRegenerationForReview,
  getPendingKnowledgeBitsWithAttentionForReview,
} from '../knowledge-bit/knowledge-bit-review.api'
import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'

import { isNoteActive, resolveDoneNote, resolveFailedNote } from './added-note-progress'
import type { AddedNote } from './added-note-progress'
import type { AddedSource } from './submit-knowledge-blocks'

export const ADDED_NOTE_POLL_INTERVAL_MS = 3000
export const ADDED_NOTE_MAX_POLLS = 200

type LoadGroups = () => ReturnType<typeof getPendingKnowledgeBitsWithAttentionForReview>

async function resolveNote(note: AddedNote, loadGroups: LoadGroups) {
  const status = await getKnowledgeSourceRegenerationForReview({ data: { sourceId: note.sourceId } })

  if (status.status === 'failed') {
    return resolveFailedNote(note, status)
  }

  if (status.status === 'done') {
    return resolveDoneNote(note, await loadGroups())
  }

  return note.phase === 'working' ? note : { ...note, phase: 'working' as const }
}

export function useAddedNoteProgress() {
  const [notes, setNotes] = useState<AddedNote[]>([])
  const notesRef = useRef(notes)
  const polls = useRef(0)
  const polling = useRef(false)
  const active = notes.some(isNoteActive)

  notesRef.current = notes

  const track = useCallback((added: AddedSource[]) => {
    if (added.length === 0) {
      return
    }

    polls.current = 0
    setNotes((current) => [...current, ...added.map((entry) => ({ ...entry, phase: 'queued' as const }))])
  }, [])

  useEffect(() => {
    if (!active) {
      return
    }

    async function poll() {
      if (polling.current) {
        return
      }

      polling.current = true
      polls.current += 1

      try {
        if (polls.current > ADDED_NOTE_MAX_POLLS) {
          setNotes((current) => current.map((note) => (isNoteActive(note) ? { ...note, phase: 'slow' } : note)))

          return
        }

        let groups: ReturnType<LoadGroups> | null = null
        const loadGroups: LoadGroups = () => (groups ??= getPendingKnowledgeBitsWithAttentionForReview())
        const pending = notesRef.current.filter(isNoteActive)
        const settled = await Promise.allSettled(pending.map((note) => resolveNote(note, loadGroups)))
        const updates = new Map<string, AddedNote>()

        settled.forEach((result, i) => {
          if (result.status === 'fulfilled') {
            updates.set(pending[i].sourceId, result.value)
          }
        })

        setNotes((current) => current.map((note) => updates.get(note.sourceId) ?? note))

        if ([...updates.values()].some((note) => !isNoteActive(note))) {
          notifyPendingReviewChanged()
        }
      } finally {
        polling.current = false
      }
    }

    const timer = setInterval(() => void poll(), ADDED_NOTE_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [active])

  return { notes, track }
}
