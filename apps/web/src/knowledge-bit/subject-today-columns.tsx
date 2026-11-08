import type { SubjectTodayCounts } from './use-subject-today-counts'

const EN_DASH = '–'

export interface SubjectTodayColumnsProps {
  subjectId: string
  matureCount: number
  learningCount: number
  newCount: number
  today: SubjectTodayCounts
}

function Column({
  testId,
  label,
  value,
  emphasized,
}: {
  testId: string
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <span className="flex w-14 flex-col items-end">
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
      <span
        data-testid={testId}
        className={emphasized ? 'text-sm font-semibold text-neutral-900' : 'text-sm text-neutral-600'}
      >
        {value}
      </span>
    </span>
  )
}

export function SubjectTodayColumns({
  subjectId,
  matureCount,
  learningCount,
  newCount,
  today,
}: SubjectTodayColumnsProps) {
  const todayValue = today.status === 'ready' ? String(today.byId.get(subjectId) ?? 0) : EN_DASH

  return (
    <span data-testid={`knowledge-browser-subject-columns-${subjectId}`} className="hidden shrink-0 items-end gap-2 md:flex">
      <Column testId={`knowledge-browser-subject-mature-${subjectId}`} label="Mature" value={String(matureCount)} />
      <Column testId={`knowledge-browser-subject-learning-${subjectId}`} label="Learning" value={String(learningCount)} />
      <Column testId={`knowledge-browser-subject-new-${subjectId}`} label="New" value={String(newCount)} />
      <Column
        testId={`knowledge-browser-subject-today-${subjectId}`}
        label="Today"
        value={todayValue}
        emphasized
      />
    </span>
  )
}
