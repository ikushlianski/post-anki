import type { TodayView } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { getMotivationToday } from './motivation.api'
import { plural } from '../shared/plural'

export function goalChipText(today: TodayView): string {
  const goal = today.dayQualified
    ? 'Goal done today'
    : `${today.reviewsDone} of ${today.threshold} today`

  return today.streak.current > 0 ? `${plural(today.streak.current, 'day')} streak · ${goal}` : goal
}

export function GoalProgressChip() {
  const { result } = useStudyGoalData(() => getMotivationToday())

  if (!result?.ok) {
    return null
  }

  return (
    <span
      data-testid="goal-progress-chip"
      className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-900"
    >
      {goalChipText(result.data)}
    </span>
  )
}
