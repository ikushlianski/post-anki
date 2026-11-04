import type { Streak, StudyOverview } from '@post-anki/shared'

import type { LoadResult } from '../shared/load-result'
import { ActivityCalendar } from './activity-calendar'
import { plural } from '../shared/plural'

function StreakStat({ streak }: { streak: LoadResult<Streak> }) {
  if (!streak.ok) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Couldn't load your streak — try refreshing.
      </p>
    )
  }

  const { currentStreak, longestStreak } = streak.data

  return (
    <div data-testid="progress-streak">
      <p data-testid="streak-current" className="text-2xl font-semibold tabular-nums">
        <span aria-hidden="true">🔥 </span>
        {plural(currentStreak, 'day')}
      </p>
      <p data-testid="streak-longest" className="text-xs text-neutral-500">
        {currentStreak === 0 ? 'No streak yet · ' : ''}Best {plural(longestStreak, 'day')}
      </p>
    </div>
  )
}

export function ProgressStrip({
  overview,
  streak,
}: {
  overview: LoadResult<StudyOverview>
  streak: LoadResult<Streak>
}) {
  return (
    <section data-testid="progress-strip" className="card-compact">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Progress
      </h2>
      <div className="mb-4 flex gap-6">
        <div>
          {overview.ok ? (
            <>
              <p data-testid="reviewed-today" className="text-2xl font-semibold tabular-nums">
                {overview.data.reviewedToday}
              </p>
              <p className="text-xs text-neutral-500">Reviewed today</p>
            </>
          ) : (
            <p role="alert" className="text-sm text-red-600">
              Couldn't load today's progress.
            </p>
          )}
        </div>
        <StreakStat streak={streak} />
      </div>
      {overview.ok ? <ActivityCalendar activity={overview.data.activity} /> : null}
    </section>
  )
}
