import { useMemo, useState } from 'react'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

export type CreatedSortDirection = 'asc' | 'desc'

export function nextCreatedSort(current: CreatedSortDirection | null): CreatedSortDirection {
  return current === 'desc' ? 'asc' : 'desc'
}

export function sortByCreated(
  rows: KnowledgeBitBrowserItem[],
  direction: CreatedSortDirection | null,
): KnowledgeBitBrowserItem[] {
  if (!direction) return rows

  const sign = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => sign * (Date.parse(a.addedAt) - Date.parse(b.addedAt)))
}

export function useCreatedSort(rows: KnowledgeBitBrowserItem[]) {
  const [direction, setDirection] = useState<CreatedSortDirection | null>(null)
  const sorted = useMemo(() => sortByCreated(rows, direction), [rows, direction])

  return { direction, sorted, toggle: () => setDirection((current) => nextCreatedSort(current)) }
}
