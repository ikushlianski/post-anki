import type { SessionSummary } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { streakHeadline } from './streak-card'
import { getSessionSummary } from './motivation.api'
import { plural } from '../shared/plural'

function monthsOrDays(days: number): string {
  return days >= 60 ? `${Math.round(days / 30)} months` : plural(days, 'day')
}

export function SessionClosureView({ summary }: { summary: SessionSummary }) {
  const goalLine =
    summary.goalTarget === null
      ? `${plural(summary.doneToday, 'review')} today`
      : summary.goalMet
        ? `Goal met: ${summary.doneToday} of ${summary.goalTarget} reviews`
        : `${summary.doneToday} of ${summary.goalTarget} reviews toward today's goal`

  return (
    <section data-testid="session-closure" className="mt-4 flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
      <p data-testid="session-closure-goal" className="text-base font-medium text-neutral-900">
        {goalLine}
      </p>
      {summary.bonus > 0 ? (
        <p data-testid="session-closure-bonus" className="text-sm text-neutral-600">
          {plural(summary.bonus, 'bonus review')} beyond the goal
        </p>
      ) : null}
      {summary.newlySolid > 0 ? (
        <p data-testid="session-closure-solid" className="text-sm text-neutral-700">
          {summary.newlySolid === 1 ? '1 card is now solid' : `${summary.newlySolid} cards are now solid`}
        </p>
      ) : null}
      {summary.surprise ? (
        <p data-testid="session-closure-surprise" className="text-sm text-indigo-700">
          You recalled a card{summary.surprise.subjectName ? ` from ${summary.surprise.subjectName}` : ''} after{' '}
          {monthsOrDays(summary.surprise.gapDays)} away.
        </p>
      ) : null}
      <p data-testid="session-closure-tomorrow" className="text-sm text-neutral-600">
        {summary.tomorrowDue === 0
          ? 'Nothing is due tomorrow.'
          : `Tomorrow: ${summary.tomorrowDue} due, about ${plural(summary.tomorrowMinutes, 'minute')}`}
      </p>
      <p data-testid="session-closure-streak" className="text-sm text-neutral-600">
        {streakHeadline(summary.streak)}
      </p>
      <p data-testid="session-closure-stop" className="text-sm font-medium text-neutral-900">
        You're done for today. More is optional.
      </p>
    </section>
  )
}

export function SessionClosure({ refreshKey = 0 }: { refreshKey?: number }) {
  const { result } = useStudyGoalData(() => getSessionSummary(), refreshKey)

  if (!result?.ok) {
    return null
  }

  return <SessionClosureView summary={result.data} />
}
