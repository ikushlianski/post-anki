import { KNOWLEDGE_PURGE_MAX_IDS } from '@post-anki/shared'

export const BROWSER_SELECTION_CAP = KNOWLEDGE_PURGE_MAX_IDS

export interface BrowserSelection {
  selected: ReadonlySet<string>
  anchor: string | null
}

export const EMPTY_BROWSER_SELECTION: BrowserSelection = { selected: new Set(), anchor: null }

function withCap(ids: Iterable<string>): Set<string> {
  return new Set([...ids].slice(0, BROWSER_SELECTION_CAP))
}

export function toggleBrowserRow(selection: BrowserSelection, id: string): BrowserSelection {
  const next = new Set(selection.selected)

  if (next.has(id)) {
    next.delete(id)
  } else if (next.size < BROWSER_SELECTION_CAP) {
    next.add(id)
  }

  return { selected: next, anchor: id }
}

export function selectBrowserRange(
  selection: BrowserSelection,
  orderedIds: readonly string[],
  targetId: string,
): BrowserSelection {
  const from = selection.anchor === null ? -1 : orderedIds.indexOf(selection.anchor)
  const to = orderedIds.indexOf(targetId)

  if (from === -1 || to === -1) {
    return toggleBrowserRow(selection, targetId)
  }

  const range = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1)

  return { selected: withCap([...selection.selected, ...range]), anchor: selection.anchor }
}

export function addBrowserRows(selection: BrowserSelection, ids: readonly string[]): BrowserSelection {
  return { selected: withCap([...selection.selected, ...ids]), anchor: ids[0] ?? selection.anchor }
}

export function toggleAllBrowserRows(
  selection: BrowserSelection,
  orderedIds: readonly string[],
): BrowserSelection {
  const allSelected = orderedIds.length > 0 && orderedIds.every((id) => selection.selected.has(id))

  if (allSelected) {
    return EMPTY_BROWSER_SELECTION
  }

  return { selected: withCap([...selection.selected, ...orderedIds]), anchor: orderedIds[0] ?? null }
}

export function pruneBrowserSelection(
  selection: BrowserSelection,
  orderedIds: readonly string[],
): BrowserSelection {
  const present = new Set(orderedIds)
  const kept = [...selection.selected].filter((id) => present.has(id))

  if (kept.length === selection.selected.size) {
    return selection
  }

  return {
    selected: new Set(kept),
    anchor: selection.anchor !== null && present.has(selection.anchor) ? selection.anchor : null,
  }
}
