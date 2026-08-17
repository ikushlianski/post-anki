import { useState } from 'react'

import type { Note, NoteReviewResponse } from '@post-anki/shared'

import type { ApiResult } from './note.model'

export interface NotesReviewPanelProps {
  onReview: (excludeIds: string[]) => Promise<ApiResult<NoteReviewResponse>>
}

export function NotesReviewPanel({ onReview }: NotesReviewPanelProps) {
  const [shownIds, setShownIds] = useState<string[]>([])
  const [current, setCurrent] = useState<Note | null>(null)
  const [hasRequested, setHasRequested] = useState(false)
  const [busy, setBusy] = useState(false)

  async function requestOne(excludeIds: string[]) {
    setBusy(true)

    const result = await onReview(excludeIds)

    setBusy(false)
    setHasRequested(true)

    if (!result.ok) {
      setCurrent(null)
      return
    }

    const note = result.data.note

    setCurrent(note)

    if (note) {
      setShownIds((prev) => [...prev, note.id])
    }
  }

  if (!hasRequested) {
    return (
      <div data-testid="notes-review-panel" className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-600">
          Reread something you wrote before — one note at a time.
        </p>
        <button
          type="button"
          data-testid="notes-review-start"
          disabled={busy}
          onClick={() => requestOne(shownIds)}
          className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Finding a note…' : 'Show me a note'}
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <p
        data-testid="notes-review-empty"
        className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
      >
        Nothing left to reread right now.
      </p>
    )
  }

  return (
    <div data-testid="notes-review-panel" className="space-y-3">
      <div
        data-testid="notes-review-note"
        className={
          current.isHighlight
            ? 'rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 italic'
            : 'rounded-lg border border-neutral-200 bg-white p-4'
        }
      >
        <p className="text-xs text-neutral-400">
          {current.nodeType}
          {current.concern ? ` · ${current.concern}` : ''}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
          {current.body}
        </p>
      </div>

      <button
        type="button"
        data-testid="notes-review-another"
        disabled={busy}
        onClick={() => requestOne(shownIds)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
      >
        {busy ? 'Finding a note…' : 'Read another'}
      </button>
    </div>
  )
}
