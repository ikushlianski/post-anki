import { useState } from 'react'
import { KNOWLEDGE_BIT_USER_NOTE_MAX_LENGTH } from '@post-anki/shared'

import { saveKnowledgeBitUserNote } from './knowledge-bit-user-note.api'

export function KnowledgeBitUserNote({
  knowledgeBitId,
  initialNote,
}: {
  knowledgeBitId: string
  initialNote: string | null | undefined
}) {
  const [saved, setSaved] = useState(initialNote?.trim() ? initialNote : null)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (draft === null) return

    setSaving(true)
    setError(null)

    try {
      const outcome = await saveKnowledgeBitUserNote({ data: { id: knowledgeBitId, note: draft } })

      if (outcome.ok) {
        setSaved(outcome.userNote)
        setDraft(null)
      } else {
        setError('Could not save your note. Try again.')
      }
    } catch {
      setError('Could not save your note. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (draft !== null) {
    return (
      <div data-testid="user-note-editor" className="flex flex-col gap-2">
        <label className="text-xs font-medium text-neutral-500" htmlFor={`user-note-${knowledgeBitId}`}>
          My note
        </label>
        <textarea
          id={`user-note-${knowledgeBitId}`}
          data-testid="user-note-input"
          value={draft}
          maxLength={KNOWLEDGE_BIT_USER_NOTE_MAX_LENGTH}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full rounded-md border border-neutral-300 p-2 text-sm"
        />
        {error && (
          <p role="alert" data-testid="user-note-error" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="user-note-save"
            disabled={saving}
            onClick={() => void save()}
            className="min-h-11 rounded-md border border-neutral-300 px-3 py-1 text-xs sm:min-h-0"
          >
            {saving ? 'Saving' : 'Save note'}
          </button>
          <button
            type="button"
            data-testid="user-note-cancel"
            disabled={saving}
            onClick={() => {
              setDraft(null)
              setError(null)
            }}
            className="min-h-11 rounded-md px-3 py-1 text-xs text-neutral-600 sm:min-h-0"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="user-note" className="flex flex-col items-start gap-1">
      {saved && (
        <p data-testid="user-note-text" className="whitespace-pre-wrap break-words text-sm text-neutral-700">
          {saved}
        </p>
      )}
      <button
        type="button"
        data-testid="user-note-edit"
        onClick={() => setDraft(saved ?? '')}
        className="min-h-11 text-xs text-neutral-500 underline sm:min-h-0"
      >
        {saved ? 'Edit note' : 'Add note'}
      </button>
    </div>
  )
}
