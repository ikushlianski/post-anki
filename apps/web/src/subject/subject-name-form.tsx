import { useState } from 'react'
import type { FormEvent } from 'react'

export interface SubjectNameFormTestIds {
  input?: string
  error?: string
  cancel?: string
  submit?: string
}

export interface SubjectNameFormProps {
  initialValue: string
  ariaLabel: string
  placeholder?: string
  submitLabel: string
  busy: boolean
  error: string | null
  testIds?: SubjectNameFormTestIds
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function SubjectNameForm({
  initialValue,
  ariaLabel,
  placeholder,
  submitLabel,
  busy,
  error,
  testIds,
  onSubmit,
  onCancel,
}: SubjectNameFormProps) {
  const [draft, setDraft] = useState(initialValue)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const name = draft.trim()

    if (!name) {
      return
    }

    onSubmit(name)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-2">
      <input
        value={draft}
        disabled={busy}
        aria-label={ariaLabel}
        placeholder={placeholder}
        data-testid={testIds?.input}
        onChange={(event) => setDraft(event.target.value)}
        className="rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
      />
      {error ? (
        <p role="alert" data-testid={testIds?.error} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-testid={testIds?.cancel}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || draft.trim() === ''}
          data-testid={testIds?.submit}
          className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
