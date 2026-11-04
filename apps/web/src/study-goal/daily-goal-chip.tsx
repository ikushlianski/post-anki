import type { DailyGoalProgress } from '@post-anki/shared'

import { getDailyGoalProgress } from './study-goal.api'
import { useStudyGoalData } from './use-study-goal-data'
import { browserTimeZone } from '../shared/browser-time-zone'

export function DailyGoalChip({ progress }: { progress: DailyGoalProgress | null }) {
  if (!progress || progress.target === null) {
    return null
  }

  const met = progress.doneToday >= progress.target

  return (
    <p
      data-testid="daily-goal-chip"
      data-met={met}
      className={`inline-block rounded-full border px-3 py-1 text-sm tabular-nums ${
        met ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-neutral-200 text-neutral-600'
      }`}
    >
      Today: {progress.doneToday} of {progress.target}
      {met ? ' · goal met' : ''}
    </p>
  )
}

export function DailyGoalChipLoader({ refreshKey = 0 }: { refreshKey?: number }) {
  const { result } = useStudyGoalData(() => getDailyGoalProgress({ data: browserTimeZone() }), refreshKey)

  return <DailyGoalChip progress={result?.ok ? result.data : null} />
}
