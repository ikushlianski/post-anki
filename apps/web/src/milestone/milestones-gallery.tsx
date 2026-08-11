import type { Milestone } from '@post-anki/shared'

import { criteriaLabel, entityTypeLabel } from './milestone-criteria-label'
import { sortMilestonesNewestFirst } from './sort-milestones'

export interface MilestonesGalleryProps {
  milestones: Milestone[]
}

export function MilestonesGallery({ milestones }: MilestonesGalleryProps) {
  if (milestones.length === 0) {
    return (
      <p
        data-testid="milestones-empty"
        className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
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
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
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
