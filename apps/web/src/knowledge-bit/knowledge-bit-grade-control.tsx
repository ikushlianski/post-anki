export const GRADE_VALUES = [1, 2, 3, 4, 5] as const

export function GradeControl({
  label,
  value,
  onChange,
  testId,
  tone = 'light',
  disabled,
}: {
  label: string
  value: number | null
  onChange: (grade: number) => void
  testId: string
  tone?: 'light' | 'dark'
  disabled?: boolean
}) {
  const dark = tone === 'dark'
  const base = dark
    ? 'bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white'
    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 focus-visible:outline-neutral-900'
  const selected = dark ? 'bg-white text-neutral-900 hover:bg-white' : 'bg-neutral-900 text-white hover:bg-neutral-900'

  return (
    <div role="group" aria-label={label} data-testid={testId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`text-xs font-medium ${dark ? 'text-white/80' : 'text-neutral-500'}`}>{label}</span>
      <span className="inline-flex items-center gap-1">
        {GRADE_VALUES.map((grade) => (
          <button
            key={grade}
            type="button"
            data-testid={`${testId}-${grade}`}
            aria-pressed={value === grade}
            aria-label={`${label}: ${grade} of 5`}
            disabled={disabled}
            onClick={() => onChange(grade)}
            className={`size-[44px] rounded-md text-xs font-medium sm:size-8 focus-visible:outline-2 disabled:opacity-50 ${
              value === grade ? selected : base
            }`}
          >
            {grade}
          </button>
        ))}
      </span>
    </div>
  )
}
