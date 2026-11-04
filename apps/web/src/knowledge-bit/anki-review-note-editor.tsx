import { useEffect, useState, type KeyboardEvent } from 'react'
import {
  parseCloze,
  CLOZE_ERROR_MESSAGES,
  ORDERED_LIST_ERROR_MESSAGES,
  buildClozeCards,
  buildOrderedListCards,
  parseOrderedListText,
} from '@post-anki/shared'

import { getKnowledgeBrowserDetail } from './knowledge-browser-detail.api'

type EditorMode = 'cloze' | 'list'

export function AnkiReviewNoteEditor({
  mode = 'cloze',
  knowledgeBitId,
  variantId,
  error,
  disabled,
  onSave,
  onCancel,
}: {
  mode?: EditorMode
  knowledgeBitId: string
  variantId: string
  error: string | null
  disabled: boolean
  onSave: (note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let active = true

    getKnowledgeBrowserDetail({ data: { id: knowledgeBitId } })
      .then((outcome) => {
        if (!active) return

        const sentence = outcome.ok
          ? outcome.detail.phrasings.find((phrasing) => phrasing.id === variantId)?.sentence
          : null

        if (sentence) setNote(sentence)
        else setLoadFailed(true)
      })
      .catch(() => active && setLoadFailed(true))

    return () => {
      active = false
    }
  }, [knowledgeBitId, variantId])

  if (loadFailed) {
    return (
      <p data-testid="anki-review-note-editor-error" className="text-sm text-red-600">
        Couldn&apos;t load this note for editing.
      </p>
    )
  }

  if (note === null) {
    return <p className="text-sm text-neutral-500">Loading note...</p>
  }

  return (
    <NoteForm mode={mode} initial={note} error={error} disabled={disabled} onSave={onSave} onCancel={onCancel} />
  )
}

function previewFor(mode: EditorMode, draft: string): { problem: string | null; lines: string[] } {
  if (mode === 'list') {
    const parsed = parseOrderedListText(draft)

    return parsed.ok
      ? { problem: null, lines: buildOrderedListCards(parsed.list).map((card) => card.prompt) }
      : { problem: ORDERED_LIST_ERROR_MESSAGES[parsed.error], lines: [] }
  }

  const parsed = parseCloze(draft)

  return parsed.ok
    ? { problem: null, lines: buildClozeCards(parsed.note).map((card) => card.prompt) }
    : { problem: CLOZE_ERROR_MESSAGES[parsed.error], lines: [] }
}

export function NoteForm({
  mode,
  initial,
  error,
  disabled,
  onSave,
  onCancel,
}: {
  mode: EditorMode
  initial: string
  error: string | null
  disabled: boolean
  onSave: (note: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const { problem, lines } = previewFor(mode, draft)
  const canSave = problem === null && !disabled

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onCancel()

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSave) onSave(draft)
  }

  return (
    <div data-testid="anki-review-note-editor" className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
      <textarea
        aria-label={mode === 'list' ? 'Ordered list' : 'Note with gaps'}
        data-testid="anki-review-note-editor-text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="rounded-md border border-neutral-300 p-2 text-sm"
        rows={4}
      />
      <p className="text-xs text-neutral-500">
        {mode === 'list'
          ? 'Put the title on the first line and one step per line, 3 to 8 steps. Each step becomes its own cards.'
          : "Wrap each gap like {{c1::answer}} or {{c1::answer::hint}}. Each number becomes its own card."}
      </p>
      {problem === null && (
        <ul data-testid="anki-review-note-editor-preview" className="text-xs text-neutral-600">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {(problem ?? error) && (
        <p data-testid="anki-review-editor-error" className="text-sm text-red-600">
          {problem ?? error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="anki-review-editor-save"
          disabled={!canSave}
          onClick={() => onSave(draft)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          data-testid="anki-review-editor-cancel"
          onClick={onCancel}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
