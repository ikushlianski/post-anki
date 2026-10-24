import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

export function idsFromSource(rows: readonly KnowledgeBitBrowserItem[], sourceId: string): string[] {
  return rows.filter((row) => row.sourceId === sourceId).map((row) => row.knowledgeBitId)
}

export function singleSelectedSource(
  rows: readonly KnowledgeBitBrowserItem[],
  selected: ReadonlySet<string>,
): string | null {
  const sources = new Set(
    rows.filter((row) => selected.has(row.knowledgeBitId)).map((row) => row.sourceId ?? null),
  )

  const [only] = [...sources]

  return sources.size === 1 && only ? only : null
}
