import { useState, type ReactNode } from 'react'
import { MAX_STEP_MINUTES, MAX_STEPS_COUNT, MIN_STEP_MINUTES, stepsMinutesSchema } from '@post-anki/shared'

export function parseStepsInput(text: string): number[] | null {
  const parts = text
    .split(/[\s,]+/)
    .filter((part) => part !== '')
    .map(Number)
  const parsed = stepsMinutesSchema.safeParse(parts)

  return parsed.success ? parsed.data : null
}

export function StepsField({
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
  value: number[]
  onChange: (next: number[]) => void | Promise<boolean>
  disabled?: boolean
  testId: string
  hint?: ReactNode
}) {
  const [draft, setDraft] = useState(value.join(', '))
  const [invalid, setInvalid] = useState(false)

  async function commit() {
    const next = parseStepsInput(draft)

    if (next === null) {
      setInvalid(true)

      return
    }

    setInvalid(false)
    setDraft(next.join(', '))

    if (next.join(',') !== value.join(',')) {
      const saved = await onChange(next)

      if (saved === false) {
        setDraft(value.join(', '))
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
        {invalid ? (
          <p role="alert" data-testid={`${testId}-invalid`} className="mt-1 text-xs text-red-600">
            Enter 1 to {MAX_STEPS_COUNT} whole minutes, {MIN_STEP_MINUTES} to {MAX_STEP_MINUTES}, separated by commas.
          </p>
        ) : null}
        {hint}
      </div>
      <input
        id={`${testId}-input`}
        data-testid={`${testId}-input`}
        type="text"
        value={draft}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit()
        }}
        className="min-h-[44px] w-32 shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm disabled:opacity-50 sm:min-h-0"
      />
    </div>
  )
}
