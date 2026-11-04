import { type ReactNode } from 'react'

import type { StudyIntent } from '@post-anki/shared'

export type IntentChoice = StudyIntent | 'inherit'

export function StudyIntentField({
  value,
  onChange,
  disabled,
  testId,
  hint,
}: {
  value: IntentChoice
  onChange: (next: IntentChoice) => void
  disabled?: boolean
  testId: string
  hint?: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="min-w-0">
        <label htmlFor={`${testId}-input`} className="text-sm font-medium">
          Studying for
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">
          An exam on a date, or long-term knowledge with no deadline.
        </p>
        {hint}
      </div>
      <select
        id={`${testId}-input`}
        data-testid={`${testId}-input`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as IntentChoice)}
        className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="inherit">Same as parent</option>
        <option value="exam">Exam</option>
        <option value="long_term">Long-term</option>
      </select>
    </div>
  )
}

export function intentSourceText(
  intent: { studyIntent: StudyIntent; examDate: string | null; source: string },
  subjectId: string,
  subjectNames: Record<string, string>,
): string {
  const label = intent.studyIntent === 'exam' ? `Exam on ${intent.examDate ?? 'an unset date'}` : 'Long-term'

  if (intent.source === subjectId) {
    return `${label}, set on this subject.`
  }

  return intent.source === 'app'
    ? `${label}, the app default.`
    : `${label}, from ${subjectNames[intent.source] ?? 'a parent subject'}.`
}
