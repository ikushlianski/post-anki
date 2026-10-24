import { KNOWLEDGE_BIT_BULK_MAX_IDS } from '@post-anki/shared'

export const OVERVIEW_SELECTION_CAP = KNOWLEDGE_BIT_BULK_MAX_IDS

export interface OverviewSelection {
  selected: ReadonlySet<string>
  anchor: string | null
  cursor: string | null
  base: ReadonlySet<string> | null
}

export interface OverviewSelectionUpdate {
  selection: OverviewSelection
  capped: boolean
}

export function emptySelection(): OverviewSelection {
  return { selected: new Set(), anchor: null, cursor: null, base: null }
}

export function setCursor(selection: OverviewSelection, id: string | null): OverviewSelection {
  if (selection.cursor === id) {
    return selection
  }

  return {
    ...selection,
    cursor: id,
    anchor: selection.selected.size === 0 ? null : selection.anchor,
    base: null,
  }
}

export function clearSelection(selection: OverviewSelection): OverviewSelection {
  return { selected: new Set(), anchor: null, cursor: selection.cursor, base: null }
}

export function toggleRow(selection: OverviewSelection, id: string): OverviewSelectionUpdate {
  const selected = new Set(selection.selected)

  if (selected.has(id)) {
    selected.delete(id)

    return { selection: { selected, anchor: id, cursor: id, base: null }, capped: false }
  }

  if (selected.size >= OVERVIEW_SELECTION_CAP) {
    return { selection: { ...selection, cursor: id }, capped: true }
  }

  selected.add(id)

  return { selection: { selected, anchor: id, cursor: id, base: null }, capped: false }
}

export function extendTo(
  selection: OverviewSelection,
  orderedIds: readonly string[],
  targetId: string,
): OverviewSelectionUpdate {
  const anchor = selection.anchor ?? selection.cursor ?? targetId
  const base = selection.base ?? selection.selected
  const anchorIndex = orderedIds.indexOf(anchor)
  const targetIndex = orderedIds.indexOf(targetId)

  if (anchorIndex === -1 || targetIndex === -1) {
    return { selection: { ...selection, cursor: targetId }, capped: false }
  }

  const step = targetIndex >= anchorIndex ? 1 : -1
  const selected = new Set(base)
  let capped = false

  for (let index = anchorIndex; index !== targetIndex + step; index += step) {
    const id = orderedIds[index]

    if (selected.has(id)) {
      continue
    }

    if (selected.size >= OVERVIEW_SELECTION_CAP) {
      capped = true
      break
    }

    selected.add(id)
  }

  return { selection: { selected, anchor, cursor: targetId, base }, capped }
}

export function selectAllLoaded(
  selection: OverviewSelection,
  orderedIds: readonly string[],
): OverviewSelectionUpdate {
  const selected = new Set<string>()

  for (const id of orderedIds) {
    if (selected.size >= OVERVIEW_SELECTION_CAP) {
      break
    }

    selected.add(id)
  }

  return {
    selection: { selected, anchor: orderedIds[0] ?? null, cursor: selection.cursor, base: null },
    capped: orderedIds.length > selected.size,
  }
}

export function pruneSelection(
  selection: OverviewSelection,
  orderedIds: readonly string[],
): OverviewSelection {
  const present = new Set(orderedIds)
  const selected = new Set([...selection.selected].filter((id) => present.has(id)))
  const unchanged =
    selected.size === selection.selected.size &&
    (selection.anchor === null || present.has(selection.anchor)) &&
    (selection.cursor === null || present.has(selection.cursor))

  if (unchanged) {
    return selection
  }

  return {
    selected,
    anchor: selection.anchor !== null && present.has(selection.anchor) ? selection.anchor : null,
    cursor: selection.cursor !== null && present.has(selection.cursor) ? selection.cursor : null,
    base: null,
  }
}

export function selectedInOrder(
  selection: OverviewSelection,
  orderedIds: readonly string[],
): string[] {
  return orderedIds.filter((id) => selection.selected.has(id))
}

export function pickFocusAfterRemoval(
  orderedIds: readonly string[],
  removed: ReadonlySet<string>,
  fromId: string | null,
): string | null {
  const survivors = orderedIds.filter((id) => !removed.has(id))

  if (fromId !== null && !removed.has(fromId) && survivors.includes(fromId)) {
    return fromId
  }

  const fromIndex = fromId === null ? -1 : orderedIds.indexOf(fromId)

  if (fromIndex === -1) {
    return survivors[0] ?? null
  }

  const next = orderedIds.slice(fromIndex + 1).find((id) => !removed.has(id))

  if (next !== undefined) {
    return next
  }

  return orderedIds.slice(0, fromIndex).reverse().find((id) => !removed.has(id)) ?? null
}
