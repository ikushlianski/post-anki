import { Link } from '@tanstack/react-router'

import type { SubjectReviewDueCounts } from '@post-anki/shared'

import type { LoadResult } from '../shared/load-result'
import { selectBusiestSubjects } from './select-busiest-subjects'

interface SubjectLike {
  id: string
  name: string
  parentId?: string | null
}

function SubjectCard({
  name,
  dueCount,
  newCount,
  subjectId,
  note,
  testId,
}: {
  name: string
  dueCount: number
  newCount: number
  subjectId?: string
  note?: string
  testId: string
}) {
  return (
    <li
      data-testid={testId}
      className="flex flex-col justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div>
        <p data-testid="busiest-subject-name" className="font-medium tracking-tight">
          {name}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          <span data-testid="busiest-subject-due">{dueCount}</span>{' '}
          <span className="text-sm font-normal text-neutral-500">due</span>
        </p>
        {newCount > 0 ? <p className="text-xs text-neutral-500">{newCount} new</p> : null}
        {note ? <p className="text-xs text-neutral-400">{note}</p> : null}
      </div>
      <Link
        to="/knowledge/review"
        search={subjectId ? { subjectId } : {}}
        data-testid="busiest-subject-study"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:border-neutral-500 sm:min-h-0"
      >
        Study
      </Link>
    </li>
  )
}

export function BusiestSubjects({
  subjects,
  counts,
}: {
  subjects: SubjectLike[]
  counts: LoadResult<SubjectReviewDueCounts> | undefined
}) {
  if (!counts) {
    return null
  }

  if (!counts.ok) {
    return (
      <p role="alert" className="mb-6 text-sm text-red-600">
        Couldn't load your review counts — try refreshing.
      </p>
    )
  }

  const busiest = selectBusiestSubjects(subjects, counts.data)
  const unsorted = counts.data.unsorted

  return (
    <section data-testid="busiest-subjects" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Busiest subjects
        </h2>
        <Link to="/subjects" className="text-sm font-medium text-green-700 hover:underline">
          See all subjects
        </Link>
      </div>
      {busiest.length === 0 && unsorted.dueCount === 0 ? (
        <p data-testid="busiest-subjects-empty" className="text-sm text-neutral-500">
          No subject has cards due right now.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {busiest.map((subject) => (
            <SubjectCard
              key={subject.subjectId}
              testId="busiest-subject"
              name={subject.name}
              dueCount={subject.dueCount}
              newCount={subject.newCount}
              subjectId={subject.subjectId}
            />
          ))}
          {unsorted.dueCount > 0 ? (
            <SubjectCard
              testId="unsorted-due-bucket"
              name="Unsorted"
              dueCount={unsorted.dueCount}
              newCount={unsorted.newCount}
              note="Study opens all due cards"
            />
          ) : null}
        </ul>
      )}
    </section>
  )
}
