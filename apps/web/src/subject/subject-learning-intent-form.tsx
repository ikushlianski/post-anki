import { useState } from 'react'
import type { FormEvent } from 'react'

export const LEARNING_INTENT_MAX_LENGTH = 1000

export interface SubjectLearningIntentFormProps {
  initialValue: string
  defaultIntent: string
  subjectId: string
  busy: boolean
  error: string | null
  onSubmit: (learningIntent: string) => void
  onCancel: () => void
}

export function SubjectLearningIntentForm({
  initialValue,
  defaultIntent,
  subjectId,
  busy,
  error,
  onSubmit,
  onCancel,
}: SubjectLearningIntentFormProps) {
  const [draft, setDraft] = useState(initialValue)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(draft.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-72 flex-col gap-2 p-2">
      <label htmlFor={`subject-intent-${subjectId}`} className="text-xs text-neutral-600">
        What should extraction look for? Leave empty to use the default shown.
      </label>
      <textarea
        id={`subject-intent-${subjectId}`}
        rows={5}
        value={draft}
        disabled={busy}
        maxLength={LEARNING_INTENT_MAX_LENGTH}
        placeholder={defaultIntent}
        data-testid={`subject-intent-${subjectId}-input`}
        onChange={(event) => setDraft(event.target.value)}
        className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
      />
      {error ? (
        <p role="alert" data-testid={`subject-intent-${subjectId}-error`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-testid={`subject-intent-${subjectId}-cancel`}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          data-testid={`subject-intent-${subjectId}-confirm`}
          className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  )
}
