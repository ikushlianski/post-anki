import type { DailyGoalProgress, SubjectPriority } from '@post-anki/shared'

import { DailyGoalChip } from './daily-goal-chip'
import { describeProgress, targetFraction } from './priority-row'
import { getDailyGoalProgress, listCurrentPriorities } from './study-goal.api'
import { useStudyGoalData } from './use-study-goal-data'
import { browserTimeZone } from '../shared/browser-time-zone'

export function HomeStudyGoalsView({
  daily,
  priorities,
  subjectNames,
}: {
  daily: DailyGoalProgress | null
  priorities: SubjectPriority[]
  subjectNames: Record<string, string>
}) {
  const hasDaily = daily !== null && daily.target !== null

  if (!hasDaily && priorities.length === 0) {
    return null
  }

  return (
    <section data-testid="home-study-goals" className="card-compact mb-6">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Goals</h2>
      <DailyGoalChip progress={daily} />
      {priorities.length > 0 ? (
        <div data-testid="home-week-priorities" className="mt-3">
          <p className="mb-1 text-xs text-neutral-500">This week</p>
          <ul className="space-y-1">
            {priorities.map((priority) => (
              <li key={priority.id} data-testid="home-week-priority" data-met={priority.targetMet} className="text-sm">
                <span className={priority.targetMet ? 'text-emerald-800' : ''}>{priority.title}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {subjectNames[priority.subjectId] ? `${subjectNames[priority.subjectId]} · ` : ''}
                  {targetFraction(priority) !== null ? describeProgress(priority).split(' · ')[0] : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function HomeStudyGoals({ subjectNames }: { subjectNames: Record<string, string> }) {
  const tz = browserTimeZone()
  const { result } = useStudyGoalData(async () => {
    const [daily, priorities] = await Promise.all([getDailyGoalProgress({ data: tz }), listCurrentPriorities({ data: tz })])

    return { daily, priorities: priorities.priorities }
  })

  if (!result?.ok) {
    return null
  }

  return <HomeStudyGoalsView daily={result.data.daily} priorities={result.data.priorities} subjectNames={subjectNames} />
}
