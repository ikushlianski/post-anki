import type { StudySessionConsistency } from '@post-anki/shared'

export interface ConsistencyPanelProps {
  consistency: StudySessionConsistency
}

export function ConsistencyPanel({ consistency }: ConsistencyPanelProps) {
  const ratePercent = Math.round(consistency.rate * 100)

  return (
    <div
      data-testid="consistency-panel"
      className="card-compact"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Consistency
      </h3>
      <p className="mt-1 text-sm text-neutral-700">
        <span data-testid="consistency-completed" className="font-medium text-neutral-900">
          {consistency.completed}
        </span>{' '}
        of{' '}
        <span data-testid="consistency-planned" className="font-medium text-neutral-900">
          {consistency.planned}
        </span>{' '}
        planned sessions completed —{' '}
        <span data-testid="consistency-rate" className="font-medium text-neutral-900">
          {ratePercent}%
        </span>
      </p>
    </div>
  )
}
