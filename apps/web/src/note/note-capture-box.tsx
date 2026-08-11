import { useState } from 'react'

import { CONCERNS, type CaptureNoteInput, type Concern, type Note, type NoteNodeType } from '@post-anki/shared'

import { noteCaptureErrorMessage } from './note-capture-error'
import type { ApiResult } from './note.model'

export interface NoteCaptureBoxProps {
  nodeType: NoteNodeType
  nodeId: string
  onCapture: (input: CaptureNoteInput) => Promise<ApiResult<Note>>
  onCaptured: () => void | Promise<void>
}

export function NoteCaptureBox({
  nodeType,
  nodeId,
  onCapture,
  onCaptured,
}: NoteCaptureBoxProps) {
  const [body, setBody] = useState('')
  const [isHighlight, setIsHighlight] = useState(false)
  const [concern, setConcern] = useState<Concern | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = body.trim()

    if (trimmed === '') {
      return
    }

    setBusy(true)
    setError(null)

    const result = await onCapture({
      nodeType,
      nodeId,
      body: trimmed,
      isHighlight,
      concern: concern === '' ? null : concern,
    })

    setBusy(false)

    if (!result.ok) {
      setError(noteCaptureErrorMessage(result.code, result.message))
      return
    }

    setBody('')
    setIsHighlight(false)
    setConcern('')
    await onCaptured()
  }

  return (
    <form
      onSubmit={submit}
      data-testid="note-capture-box"
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-600">
          {isHighlight ? 'Highlight a passage' : 'Add a note'}
        </p>
        <button
          type="button"
          aria-pressed={isHighlight}
          data-testid="note-capture-highlight-toggle"
          onClick={() => setIsHighlight((prev) => !prev)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            isHighlight
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
          }`}
        >
          Highlight
        </button>
      </div>

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder={
          isHighlight ? 'Paste the passage, verbatim…' : 'Write what clicked…'
        }
        data-testid="note-capture-body"
        className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <select
        value={concern}
        onChange={(event) => setConcern(event.target.value as Concern | '')}
        data-testid="note-capture-concern"
        className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-xs"
      >
        <option value="">No concern tag</option>
        {CONCERNS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {error ? (
        <p
          role="alert"
          data-testid="note-capture-error"
          className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || body.trim() === ''}
        data-testid="note-capture-submit"
        className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : isHighlight ? 'Save highlight' : 'Save note'}
      </button>
    </form>
  )
}
