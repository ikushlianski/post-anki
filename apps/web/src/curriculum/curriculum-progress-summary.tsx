import type { CurriculumProgress } from './model'
import { ProgressBar } from './progress-bar'

export function CurriculumProgressSummary({
  status,
  progress,
  dueCount,
}: {
  status: string
  progress: CurriculumProgress
  dueCount: number
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-neutral-400">
        <span>Overall progress · {status}</span>
        <span>
          {progress.topicsMastered}/{progress.topicsIncluded} topics mastered ·{' '}
          {progress.percent}% · {dueCount} due
        </span>
      </div>
      <ProgressBar percent={progress.percent} />
    </div>
  )
}
