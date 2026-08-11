import { normalizeSearchQuery } from '@post-anki/core'
import type { Concern } from '@post-anki/shared'

export interface NoteSearchParams {
  query: string
  concern?: Concern
  domainNodeId?: string
}

export function buildNoteSearchParams(
  rawQuery: string,
  concern: Concern | '',
  domainNodeId: string,
): NoteSearchParams | null {
  const normalized = normalizeSearchQuery(rawQuery)

  if (normalized === null) {
    return null
  }

  return {
    query: normalized,
    concern: concern === '' ? undefined : concern,
    domainNodeId: domainNodeId === '' ? undefined : domainNodeId,
  }
}
