import { useSubjectTodayCounts } from '../knowledge-bit/use-subject-today-counts'
import { TodaySubjectRow } from './today-subject-row'
import { useSubjectDaySkips, useToggleSubjectDaySkip } from './use-subject-day-skips'

interface SubjectLike {
  id: string
  name: string
  parentId?: string | null
}

export function TodaySubjects({ subjects }: { subjects: SubjectLike[] }) {
  const today = useSubjectTodayCounts()
  const skipped = useSubjectDaySkips()
  const toggle = useToggleSubjectDaySkip()

  if (today.status !== 'ready') {
    return null
  }

  const rows = subjects
    .filter((subject) => !subject.parentId)
    .map((subject) => ({ ...subject, count: today.byId.get(subject.id) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  if (rows.length === 0) {
    return null
  }

  const remaining = rows.reduce((sum, row) => sum + (skipped.has(row.id) ? 0 : row.count), 0)

  return (
    <section data-testid="today-subjects" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Today</h2>
        <p className="text-sm text-neutral-600">
          <span data-testid="today-subjects-total" className="font-semibold tabular-nums">
            {remaining}
          </span>{' '}
          due
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <TodaySubjectRow
            key={row.id}
            subjectId={row.id}
            name={row.name}
            count={row.count}
            skipped={skipped.has(row.id)}
            onToggle={(subjectId, value) => toggle.mutate({ subjectId, skipped: value })}
          />
        ))}
      </ul>
    </section>
  )
}
