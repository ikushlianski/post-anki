import { useEffect } from 'react'
import type { GoalStreak, TodayView } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { browserTimeZone } from '../shared/browser-time-zone'
import {
  getMotivationSettings,
  getMotivationToday,
  pauseGoalStreak,
  saveMotivationSettings,
} from './motivation.api'
import { plural } from '../shared/plural'

export function streakHeadline(streak: GoalStreak): string {
  if (streak.status === 'broken') {
    return streak.longest > 0 ? `Best: ${plural(streak.longest, 'day')}. Start a new run today.` : 'Start a new run today.'
  }

  if (streak.status === 'none') {
    return 'Start a streak with your first goal day.'
  }

  return `${plural(streak.current, 'day')} in a row`
}

function streakNote(streak: GoalStreak): string | null {
  if (streak.status === 'broken' && streak.comeback) {
    return `Welcome back. Your ${plural(streak.previousStreak, 'day')} run counts toward your best.`
  }

  if (streak.status === 'paused') {
    return `Paused until ${streak.pausedUntil}. Your streak is safe.`
  }

  if (streak.status === 'resting') {
    return 'A rest day is covering yesterday.'
  }

  return null
}

export function StreakCardView({
  today,
  onPause,
}: {
  today: TodayView
  onPause: (days: number) => void
}) {
  const { streak } = today
  const note = streakNote(streak)
  const paused = streak.pausedUntil !== null && streak.pausedUntil >= today.date

  return (
    <section data-testid="streak-card" data-status={streak.status} className="card-compact mb-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Streak</h2>
      <p data-testid="streak-headline" className="text-base font-medium text-neutral-900">
        {streakHeadline(streak)}
      </p>
      <p data-testid="streak-today" className="mt-1 text-sm text-neutral-600">
        {today.dayQualified
          ? "Today's goal is done. More is optional."
          : `${today.reviewsDone} of ${today.threshold} reviews ${today.thresholdIsGoal ? 'for your daily goal' : 'to count today'}`}
      </p>
      {note ? (
        <p data-testid="streak-note" className="mt-1 text-sm text-neutral-500">
          {note}
        </p>
      ) : null}
      <p data-testid="streak-extras" className="mt-2 text-xs text-neutral-500">
        {plural(streak.activeDaysLast30, 'active day')} in the last 30 · {plural(streak.restDaysLeft, 'rest day')} left this month
      </p>
      <div className="mt-2 flex gap-3 text-xs">
        {paused ? (
          <button type="button" data-testid="streak-resume" className="text-indigo-600 hover:underline" onClick={() => onPause(0)}>
            End pause
          </button>
        ) : (
          <button type="button" data-testid="streak-pause" className="text-indigo-600 hover:underline" onClick={() => onPause(7)}>
            Pause for a week
          </button>
        )}
      </div>
    </section>
  )
}

export function HomeStreakCard() {
  const { result, reload } = useStudyGoalData(() => getMotivationToday())

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getMotivationSettings()

        if (!settings.timeZoneConfigured) {
          await saveMotivationSettings({ data: { timeZone: browserTimeZone() } })
          reload()
        }
      } catch {
        return
      }
    })()
  }, [reload])

  if (!result?.ok) {
    return null
  }

  return (
    <StreakCardView
      today={result.data}
      onPause={(days) => {
        void pauseGoalStreak({ data: { days } }).then(reload, () => undefined)
      }}
    />
  )
}
