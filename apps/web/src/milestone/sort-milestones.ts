import type { Milestone } from '@post-anki/shared'

export function sortMilestonesNewestFirst(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort(
    (a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
  )
}
