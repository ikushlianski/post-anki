import type { Milestone } from '@post-anki/shared'

import { criteriaLabel, entityTypeLabel } from './milestone-criteria-label'
import { sortMilestonesNewestFirst } from './sort-milestones'

export interface MilestonesGalleryProps {
  milestones: Milestone[]
  loadFailed?: boolean
  onRetry?: () => void
}

export function MilestonesGallery({ milestones, loadFailed, onRetry }: MilestonesGalleryProps) {
  if (loadFailed) {
    return (
      <div role="alert" data-testid="milestones-load-error" className="space-y-2">
        <p className="text-sm text-red-600">Could not load milestones.</p>
        <button
          type="button"
          data-testid="milestones-retry"
          onClick={onRetry}
          className="min-h-[44px] rounded-md border border-neutral-300 px-3 py-1.5 text-sm sm:min-h-0"
        >
          Retry
        </button>
      </div>
    )
  }

  if (milestones.length === 0) {
    return (
      <p
        data-testid="milestones-empty"
        className="card-empty"
      >
        Nothing achieved yet — a curriculum or Area lands here the moment it's fully
        mastered.
      </p>
    )
  }

  const ordered = sortMilestonesNewestFirst(milestones)

  return (
    <ul data-testid="milestones-gallery" className="grid gap-3 sm:grid-cols-2">
      {ordered.map((milestone) => (
        <li
          key={milestone.id}
          data-testid="milestone-card"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <span className="badge-amber">
            {entityTypeLabel(milestone.entityType)}
          </span>
          <h3 className="mt-2 text-sm font-medium text-neutral-900">
            {milestone.entityLabel ?? 'Unnamed'}
          </h3>
          <p className="mt-1 text-xs text-neutral-600">
            {criteriaLabel(milestone.criteriaKey)}
          </p>
          <p className="mt-2 text-[11px] text-neutral-400">
            {formatAchievedAt(milestone.achievedAt)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function formatAchievedAt(achievedAt: string): string {
  return new Date(achievedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
