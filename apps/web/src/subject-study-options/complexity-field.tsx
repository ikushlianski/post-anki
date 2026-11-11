import type { ComplexityLevel, SubjectStudyOptions } from '@post-anki/shared'

const LEVELS: { value: ComplexityLevel; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'cram', label: 'Cram' },
]

const LEVEL_NAME: Record<string, string> = { easy: 'Easy', normal: 'Normal', cram: 'Cram', custom: 'Custom retention' }

function hintText(
  complexity: SubjectStudyOptions['complexity'],
  subjectId: string,
  subjectNames: Record<string, string>,
): string {
  const name = LEVEL_NAME[complexity.level] ?? complexity.level

  if (complexity.source === subjectId) {
    return `${name}, set on this subject.`
  }

  if (complexity.source === 'app') {
    return 'Normal, the app default.'
  }

  return `${name}, inherited from ${subjectNames[complexity.source] ?? 'a parent subject'}.`
}

export function ComplexityField({
  options,
  subjectId,
  subjectNames,
  disabled,
  onChange,
}: {
  options: SubjectStudyOptions
  subjectId: string
  subjectNames: Record<string, string>
  disabled?: boolean
  onChange: (next: ComplexityLevel | null) => void
}) {
  const own = options.own.desiredRetention != null ? null : options.own.complexityLevel
  const inheritSelected = own === null && options.own.desiredRetention == null
  const { goodDays, easyDays } = options.preview
  const choices: { key: string; label: string; selected: boolean; next: ComplexityLevel | null }[] = [
    { key: 'inherit', label: 'Inherit', selected: inheritSelected, next: null },
    ...LEVELS.map(({ value, label }) => ({ key: value, label, selected: own === value, next: value })),
  ]

  return (
    <div
      data-testid="study-options-complexity"
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <p className="text-sm font-medium">Complexity</p>
      <p className="mt-0.5 text-xs text-neutral-400">
        How far apart reviews are. Easy spaces them wider, Cram keeps them tight.
      </p>
      <div role="radiogroup" aria-label="Complexity" className="mt-2 inline-flex overflow-hidden rounded-md border border-neutral-300">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={choice.selected}
            disabled={disabled}
            data-testid={`study-options-complexity-${choice.key}`}
            onClick={() => onChange(choice.next)}
            className={`min-h-[44px] px-3 py-1 text-sm disabled:opacity-50 sm:min-h-0 ${
              choice.selected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p data-testid="study-options-complexity-source" className="mt-1 text-xs text-neutral-500">
        {hintText(options.complexity, subjectId, subjectNames)}
      </p>
      <p data-testid="study-options-complexity-preview" className="mt-1 text-xs text-neutral-500">
        Next gap if Good: ~{goodDays} days, if Easy: ~{easyDays} days
      </p>
    </div>
  )
}
