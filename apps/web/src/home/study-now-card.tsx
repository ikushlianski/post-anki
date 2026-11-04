import { Link } from '@tanstack/react-router'

import type { StudyOverview } from '@post-anki/shared'

import type { LoadResult } from '../shared/load-result'
import { formatNextDue } from './format-next-due'

function CountTile({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex-1 rounded-lg bg-neutral-50 px-3 py-3 text-center">
      <p data-testid={testId} className="text-3xl font-semibold tabular-nums text-neutral-900">
        {value}
      </p>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  )
}

function StudyAction({ overview }: { overview: StudyOverview }) {
  const { counts } = overview
  const total = counts.new + counts.learning + counts.review

  if (total > 0) {
    return (
      <Link
        to="/knowledge/review"
        search={{}}
        data-testid="study-now-button"
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-green-600 px-6 py-3 text-base font-semibold text-white hover:bg-green-700"
      >
        Study now
      </Link>
    )
  }

  if (!overview.hasCards) {
    return (
      <p data-testid="study-empty" className="text-sm text-neutral-600">
        You have no cards yet.{' '}
        <Link to="/add-knowledge" search={{}} className="font-medium text-green-700 underline">
          Add knowledge
        </Link>{' '}
        to start studying.
      </p>
    )
  }

  return (
    <div data-testid="study-caught-up" className="text-sm text-neutral-600">
      <p className="font-medium text-neutral-900">All caught up</p>
      {overview.nextDueAt ? (
        <p data-testid="study-next-due">Next card due {formatNextDue(overview.nextDueAt)}</p>
      ) : null}
    </div>
  )
}

export function StudyNowCard({ overview }: { overview: LoadResult<StudyOverview> }) {
  return (
    <section data-testid="study-now-card" className="card-compact">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Study now
      </h2>
      {overview.ok ? (
        <>
          <div className="mb-4 flex gap-3">
            <CountTile label="New" value={overview.data.counts.new} testId="study-count-new" />
            <CountTile
              label="Learning"
              value={overview.data.counts.learning}
              testId="study-count-learning"
            />
            <CountTile label="Due" value={overview.data.counts.review} testId="study-count-due" />
          </div>
          <StudyAction overview={overview.data} />
        </>
      ) : (
        <p role="alert" className="text-sm text-red-600">
          Couldn't load your review counts — try refreshing.
        </p>
      )}
    </section>
  )
}
