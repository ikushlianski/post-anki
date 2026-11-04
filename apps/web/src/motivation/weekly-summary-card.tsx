import { Link } from '@tanstack/react-router'
import type { WeeklySummary } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { getWeeklySummary } from './motivation.api'
import { plural } from '../shared/plural'

export function WeeklySummaryCardView({ summary }: { summary: WeeklySummary }) {
  const delta = summary.reviews - summary.reviewsLastWeek

  return (
    <section data-testid="weekly-summary" className="card-compact mb-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">This week</h2>
      <p className="text-sm text-neutral-800">
        {plural(summary.goalDays, 'goal day')} · {plural(summary.activeDays, 'active day')} · {plural(summary.reviews, 'review')}
      </p>
      <p data-testid="weekly-summary-compare" className="mt-1 text-xs text-neutral-500">
        {delta >= 0 ? `${delta} more` : `${-delta} fewer`} than last week
        {summary.newlySolid > 0 ? ` · ${plural(summary.newlySolid, 'card')} made solid` : ''}
      </p>
      {summary.focusTotal > 0 ? (
        <p data-testid="weekly-summary-focus" className="mt-1 text-xs text-neutral-500">
          Focus: {summary.focusMet} of {summary.focusTotal} met
        </p>
      ) : null}
      {summary.needsNextWeekPriorities ? (
        <p data-testid="weekly-summary-prompt" className="mt-2 text-sm text-neutral-700">
          Pick next week's focus subjects ({summary.nextWeekKey}) on a{' '}
          <Link to="/subjects" className="text-indigo-600 hover:underline">
            subject page
          </Link>
          .
        </p>
      ) : null}
    </section>
  )
}

export function WeeklySummaryCard() {
  const { result } = useStudyGoalData(() => getWeeklySummary())

  if (!result?.ok) {
    return null
  }

  return <WeeklySummaryCardView summary={result.data} />
}
