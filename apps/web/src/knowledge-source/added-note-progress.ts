import {
  attentionWording,
  EXTRACTION_EMPTY_RESULT_WORDING,
  extractionFailureWording,
} from '@post-anki/shared'
import type { KnowledgeSourceRegenerationStatus, PendingKnowledgeSourceForReview } from '@post-anki/shared'

export type AddedNotePhase = 'queued' | 'working' | 'ready' | 'attention' | 'slow'

export interface AddedNote {
  sourceId: string
  label: string
  phase: AddedNotePhase
  cardCount?: number
  flaggedCount?: number
  reason?: string
}

export function isNoteActive(note: AddedNote): boolean {
  return note.phase === 'queued' || note.phase === 'working'
}

export function resolveFailedNote(note: AddedNote, status: KnowledgeSourceRegenerationStatus): AddedNote {
  return { ...note, phase: 'attention', reason: extractionFailureWording(status.failureReason) }
}

export function resolveDoneNote(note: AddedNote, groups: PendingKnowledgeSourceForReview[]): AddedNote {
  const group = groups.find((entry) => entry.knowledgeSourceId === note.sourceId)
  const cardCount = group?.bits.length ?? 0

  if (cardCount > 0 && group) {
    const flaggedCount = group.bits.filter((bit) => bit.reviewFlag).length

    return { ...note, phase: 'ready', cardCount, flaggedCount }
  }

  const reason = group?.attention
    ? attentionWording(group.attention.kind, group.attention.reason)
    : EXTRACTION_EMPTY_RESULT_WORDING

  return { ...note, phase: 'attention', reason }
}
