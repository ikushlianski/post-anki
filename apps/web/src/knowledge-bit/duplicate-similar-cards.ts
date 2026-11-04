import type { PendingKnowledgeBitDuplicateOf } from '@post-anki/shared'

import { getKnowledgeBrowserDetail } from './knowledge-browser-detail.api'

export const MAX_SIMILAR_CARDS = 5

export interface SimilarCard {
  id: string
  front: string
  back: string | null
  subject: string | null
}

export function similarCardIds(duplicateOf: PendingKnowledgeBitDuplicateOf): string[] {
  return [...new Set([duplicateOf.bitId, ...(duplicateOf.similarBitIds ?? [])])].slice(0, MAX_SIMILAR_CARDS)
}

export async function loadSimilarCard(
  id: string,
  duplicateOf: PendingKnowledgeBitDuplicateOf,
): Promise<SimilarCard | null> {
  try {
    const outcome = await getKnowledgeBrowserDetail({ data: { id } })

    if (outcome.ok) {
      const first = outcome.detail.phrasings[0]

      return {
        id,
        front: first?.prompt ?? outcome.detail.body,
        back: first?.answer ?? null,
        subject: outcome.detail.subjectPath.join(' / ') || null,
      }
    }
  } catch {
    return fallbackCard(id, duplicateOf)
  }

  return fallbackCard(id, duplicateOf)
}

function fallbackCard(id: string, duplicateOf: PendingKnowledgeBitDuplicateOf): SimilarCard | null {
  return id === duplicateOf.bitId
    ? { id, front: duplicateOf.front, back: duplicateOf.back, subject: null }
    : null
}
