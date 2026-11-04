import type { SubjectMastery } from '@post-anki/shared'

export function SubjectMasteryList({ subjects }: { subjects: SubjectMastery[] }) {
  const visible = subjects.filter((subject) => subject.totalCards > 0)

  if (visible.length === 0) {
    return null
  }

  return (
    <ul data-testid="subject-mastery-list" className="flex flex-col gap-3">
      {visible.map((subject) => (
        <li key={subject.subjectId} data-testid="subject-mastery-row" className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-neutral-900">{subject.subjectName}</span>
            <span className="text-neutral-500">
              {subject.masteredCards} of {subject.totalCards} solid
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${subject.subjectName} solid`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={subject.percent}
            className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
          >
            <div className="h-full bg-emerald-500" style={{ width: `${subject.percent}%` }} />
          </div>
          <p className="text-xs text-neutral-500">
            {subject.solidThisWeek > 0 ? `${subject.solidThisWeek} made solid this week` : 'None made solid this week'}
            {` · ${subject.reviewsThisWeek} reviews this week vs ${subject.reviewsLastWeek} last week`}
          </p>
        </li>
      ))}
    </ul>
  )
}
