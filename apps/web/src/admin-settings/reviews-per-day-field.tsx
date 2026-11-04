import { useId, useState } from 'react'
import { clampMaxReviewsPerDay, MAX_MAX_REVIEWS_PER_DAY } from '@post-anki/shared'

export function ReviewsPerDayField({
  label,
  description,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  description: string
  value: number
  onChange: (next: number) => void | Promise<boolean>
  disabled?: boolean
  testId?: string
}) {
  const [draft, setDraft] = useState(String(value))
  const inputId = useId()

  async function commit() {
    const parsed = draft.trim() === '' ? NaN : Number(draft)
    const next = clampMaxReviewsPerDay(parsed)

    setDraft(String(next))

    if (next !== value) {
      const saved = await onChange(next)

      if (saved === false) {
        setDraft(String(value))
      }
    }
  }

  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      </div>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_MAX_REVIEWS_PER_DAY}
        value={draft}
        disabled={disabled}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit()
        }}
        className="min-h-[44px] w-20 shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm disabled:opacity-50 sm:min-h-0"
      />
    </div>
  )
}
