import type { TagChip } from './model'

/**
 * Reconciles the chips a node's loaded data says it has with the ones this
 * session's own mutations already know about, rather than replacing one with
 * the other. `loaded` is authoritative once it catches up; until then a
 * just-assigned chip renders from `seeded` and a just-removed chip is hidden
 * even though `loaded` still lists it.
 *
 * Deliberately not "reset local state from props": a refetch that lands
 * without the new assignment (a stale read, or a route invalidation that
 * resolves against a cache written before the write committed) would erase a
 * chip the user can see was added. Merging instead means such a refetch is
 * harmless — the seeded chip simply keeps rendering until the same
 * assignmentId shows up in `loaded`, at which point it stops contributing
 * anything and the two agree.
 */
export function visibleTagChips(
  loaded: TagChip[],
  seeded: TagChip[],
  removedAssignmentIds: readonly string[],
): TagChip[] {
  const removed = new Set(removedAssignmentIds)
  const kept = loaded.filter((chip) => !removed.has(chip.assignmentId))
  const seen = new Set(kept.map((chip) => chip.assignmentId))
  const extras: TagChip[] = []

  for (const chip of seeded) {
    if (removed.has(chip.assignmentId) || seen.has(chip.assignmentId)) {
      continue
    }

    seen.add(chip.assignmentId)
    extras.push(chip)
  }

  return [...kept, ...extras]
}
