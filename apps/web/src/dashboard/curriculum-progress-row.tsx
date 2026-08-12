import { ProgressBar } from '../curriculum/progress-bar'

interface CurriculumProgressRowProps {
  topicsMastered: number
  topicsIncluded: number
  percent: number
}

export function CurriculumProgressRow({
  topicsMastered,
  topicsIncluded,
  percent,
}: CurriculumProgressRowProps) {
  return (
    <div className="space-y-1">
      <ProgressBar percent={percent} />
      <div className="flex justify-between text-xs text-neutral-400">
        <span>
          {topicsMastered}/{topicsIncluded} mastered
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}
