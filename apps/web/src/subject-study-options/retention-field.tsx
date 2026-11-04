import { useState, type ReactNode } from 'react'
import {
  MAX_DESIRED_RETENTION,
  MIN_DESIRED_RETENTION,
  desiredRetentionInputSchema,
} from '@post-anki/shared'

export function RetentionField({
  label,
  description,
  value,
  onChange,
  disabled,
  testId,
  hint,
}: {
  label: string
  description: string
  value: number
  onChange: (next: number) => void | Promise<boolean>
  disabled?: boolean
  testId: string
  hint?: ReactNode
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100)))

  async function commit() {
    const typed = draft.trim() === '' ? NaN : Number(draft) / 100
    const next = Number.isFinite(typed)
      ? Math.round(desiredRetentionInputSchema.parse(typed) * 100) / 100
      : value

    setDraft(String(Math.round(next * 100)))

    if (next !== value) {
      const saved = await onChange(next)

      if (saved === false) {
        setDraft(String(Math.round(value * 100)))
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
          {label}
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
        {hint}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-sm">
        <input
          id={`${testId}-input`}
          data-testid={`${testId}-input`}
          type="number"
          inputMode="numeric"
          min={Math.round(MIN_DESIRED_RETENTION * 100)}
          max={Math.round(MAX_DESIRED_RETENTION * 100)}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
          }}
          className="min-h-[44px] w-20 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm disabled:opacity-50 sm:min-h-0"
        />
        <span>%</span>
      </div>
    </div>
  )
}
