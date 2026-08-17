import { ProgressBar } from '../curriculum/progress-bar'

interface SubjectProgressSummaryProps {
  curriculumCount: number
  averagePercent: number
}

export function SubjectProgressSummary({
  curriculumCount,
  averagePercent,
}: SubjectProgressSummaryProps) {
  return (
    <div className="mb-3 space-y-1">
      <ProgressBar percent={averagePercent} />
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{curriculumCount} courses</span>
        <span>{averagePercent}% average</span>
      </div>
    </div>
  )
}
