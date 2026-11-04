import { useState } from 'react'

export function ExamDateField({
  value,
  onCommit,
  disabled,
  error,
  testId,
}: {
  value: string | null
  onCommit: (date: string) => void | Promise<boolean>
  disabled?: boolean
  error?: string | null
  testId: string
}) {
  const [draft, setDraft] = useState(value ?? '')

  async function commit(next: string) {
    setDraft(next)

    if (next !== '' && next !== value) {
      const saved = await onCommit(next)

      if (saved === false) {
        setDraft(value ?? '')
      }
    }
  }

  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="min-w-0">
        <label htmlFor={`${testId}-input`} className="text-sm font-medium">
          Exam date
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">
          Reviews come back before this day and new cards are spread to finish ahead of it.
        </p>
        {error ? (
          <p role="alert" data-testid={`${testId}-error`} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      <input
        id={`${testId}-input`}
        data-testid={`${testId}-input`}
        type="date"
        value={draft}
        disabled={disabled}
        onChange={(event) => void commit(event.target.value)}
        className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
      />
    </div>
  )
}
