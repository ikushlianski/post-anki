import { ProgressBar } from '../curriculum/progress-bar'

export function ModuleProgressRow({ percent }: { percent: number }) {
  return (
    <div className="space-y-1">
      <ProgressBar percent={percent} />
      <div className="text-right text-xs text-neutral-400">{percent}%</div>
    </div>
  )
}
