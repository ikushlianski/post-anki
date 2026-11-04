import {
  attentionWording,
  EXTRACTION_EMPTY_RESULT_WORDING,
  EXTRACTION_NOTHING_EXTRACTED_WORDING,
  extractionFailureWording,
} from '@post-anki/shared'
import type { KnowledgeSourceAttentionKind, KnowledgeSourceRegenerationStatus, PendingKnowledgeSourceForReview } from '@post-anki/shared'

export type AddedNotePhase = 'queued' | 'working' | 'ready' | 'attention' | 'slow'

export interface AddedNote {
  sourceId: string
  label: string
  phase: AddedNotePhase
  cardCount?: number
  flaggedCount?: number
  reason?: string
  attentionKind?: KnowledgeSourceAttentionKind
}

export function isNoteActive(note: AddedNote): boolean {
  return note.phase === 'queued' || note.phase === 'working'
}

export function resolveFailedNote(note: AddedNote, status: KnowledgeSourceRegenerationStatus): AddedNote {
  return { ...note, phase: 'attention', attentionKind: 'failed', reason: extractionFailureWording(status.failureReason) }
}

export function resolveFinishedNote(
  note: AddedNote,
  status: KnowledgeSourceRegenerationStatus,
  groups: PendingKnowledgeSourceForReview[],
): AddedNote {
  const outcome = status.outcome ?? (status.status === 'nothing_extracted' ? 'nothing' : undefined)

  if (outcome === 'nothing') {
    return { ...note, phase: 'attention', attentionKind: 'nothing_extracted', reason: EXTRACTION_NOTHING_EXTRACTED_WORDING }
  }

  if (outcome === 'cards' && status.cardCount !== undefined) {
    const group = groups.find((entry) => entry.knowledgeSourceId === note.sourceId)
    const flaggedCount = group?.bits.filter((bit) => bit.reviewFlag).length ?? 0

    return { ...note, phase: 'ready', cardCount: status.cardCount, flaggedCount }
  }

  return resolveDoneNote(note, groups)
}

export function resolveDoneNote(note: AddedNote, groups: PendingKnowledgeSourceForReview[]): AddedNote {
  const group = groups.find((entry) => entry.knowledgeSourceId === note.sourceId)
  const cardCount = group?.bits.length ?? 0

  if (cardCount > 0 && group) {
    const flaggedCount = group.bits.filter((bit) => bit.reviewFlag).length

    return { ...note, phase: 'ready', cardCount, flaggedCount }
  }

  const attentionKind = group?.attention?.kind
  const reason = group?.attention
    ? attentionWording(group.attention.kind, group.attention.reason)
    : EXTRACTION_EMPTY_RESULT_WORDING

  return attentionKind ? { ...note, phase: 'attention', reason, attentionKind } : { ...note, phase: 'attention', reason }
}
