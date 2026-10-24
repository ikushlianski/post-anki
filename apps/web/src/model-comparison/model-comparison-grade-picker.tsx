import { useState } from 'react'

import { AUTOSAVE_STATUS_TEXT, type AutoSaveStatus } from '../knowledge-bit/knowledge-bit-review-autosave'

const GRADES = [1, 2, 3, 4, 5] as const

export function ModelComparisonGradePicker({
  label,
  initial,
  onSelect,
  testId,
}: {
  label: string
  initial: number | null
  onSelect: (grade: number) => Promise<boolean>
  testId: string
}) {
  const [value, setValue] = useState<number | null>(initial)
  const [status, setStatus] = useState<AutoSaveStatus>('idle')

  async function choose(grade: number) {
    setValue(grade)
    setStatus('saving')
    setStatus((await onSelect(grade)) ? 'saved' : 'error')
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <span className="w-32 shrink-0 text-xs font-medium text-neutral-500">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1">
        {GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            aria-pressed={value === grade}
            data-testid={`${testId}-${grade}`}
            onClick={() => void choose(grade)}
            className={`size-[44px] rounded-md text-xs font-medium sm:size-7 ${
              value === grade ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {grade}
          </button>
        ))}
      </div>
      <span
        aria-live="polite"
        data-testid={`${testId}-status`}
        className={`text-xs ${status === 'error' ? 'text-red-600' : 'text-neutral-400'}`}
      >
        {AUTOSAVE_STATUS_TEXT[status]}
      </span>
    </div>
  )
}
