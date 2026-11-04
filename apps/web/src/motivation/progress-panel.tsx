import type { ProgressView } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { getMotivationProgress } from './motivation.api'
import { ProgressHeatmap } from './progress-heatmap'
import { SubjectMasteryList } from './subject-mastery-list'

export function ProgressPanelView({ progress }: { progress: ProgressView }) {
  return (
    <section data-testid="progress-panel" className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Progress</h2>
      <p data-testid="progress-solid-week" className="text-sm text-neutral-700">
        {progress.solidThisWeek === 0
          ? 'No cards became solid yet this week.'
          : `This week you made ${progress.solidThisWeek} ${progress.solidThisWeek === 1 ? 'card' : 'cards'} solid.`}
      </p>
      <p data-testid="progress-retention" className="text-sm text-neutral-700">
        {progress.retentionOlderCards === null
          ? 'Retention of older cards shows once you review cards after 30+ days.'
          : `${progress.retentionOlderCards}% of cards you had not seen for 30+ days were still remembered (${progress.retentionSample} reviews, last 90 days).`}
      </p>
      <ProgressHeatmap days={progress.heatmap} />
      <p className="text-xs text-neutral-500">Average {progress.dailyAverage} reviews on days you studied.</p>
      <SubjectMasteryList subjects={progress.subjects} />
    </section>
  )
}

export function ProgressPanel() {
  const { result } = useStudyGoalData(() => getMotivationProgress())

  if (!result?.ok) {
    return null
  }

  return <ProgressPanelView progress={result.data} />
}
