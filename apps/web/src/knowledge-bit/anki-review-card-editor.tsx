import { useState, type KeyboardEvent } from 'react'

export function AnkiReviewCardEditor({
  context,
  prompt,
  answer,
  error,
  disabled,
  onSave,
  onCancel,
}: {
  context: string
  prompt: string
  answer: string
  error: string | null
  disabled: boolean
  onSave: (prompt: string, answer: string, context: string) => void
  onCancel: () => void
}) {
  const [draftContext, setDraftContext] = useState(context)
  const [draftPrompt, setDraftPrompt] = useState(prompt)
  const [draftAnswer, setDraftAnswer] = useState(answer)
  const canSave = draftPrompt.trim() !== '' && draftAnswer.trim() !== '' && !disabled

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onCancel()
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSave) {
      onSave(draftPrompt, draftAnswer, draftContext)
    }
  }

  return (
    <div data-testid="anki-review-editor" className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
      <textarea
        aria-label="Context"
        data-testid="anki-review-editor-context"
        value={draftContext}
        onChange={(event) => setDraftContext(event.target.value)}
        placeholder="Optional: who is speaking, and to whom"
        className="rounded-md border border-neutral-300 p-2 text-xs text-neutral-600"
        rows={1}
      />
      <textarea
        aria-label="Question"
        data-testid="anki-review-editor-prompt"
        value={draftPrompt}
        onChange={(event) => setDraftPrompt(event.target.value)}
        className="rounded-md border border-neutral-300 p-2 text-sm"
        rows={3}
      />
      <textarea
        aria-label="Answer"
        data-testid="anki-review-editor-answer"
        value={draftAnswer}
        onChange={(event) => setDraftAnswer(event.target.value)}
        className="rounded-md border border-neutral-300 p-2 text-sm"
        rows={3}
      />
      {error && (
        <p data-testid="anki-review-editor-error" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="anki-review-editor-save"
          disabled={!canSave}
          onClick={() => onSave(draftPrompt, draftAnswer, draftContext)}
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
