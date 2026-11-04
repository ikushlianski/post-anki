import {
  CLOZE_ERROR_MESSAGES,
  ORDERED_LIST_ERROR_MESSAGES,
  buildClozeCards,
  buildOrderedListCards,
  formatOrderedListText,
  isOrderedListKind,
  orderedListStatement,
  parseCloze,
  parseOrderedListText,
  stripClozeMarkers,
  type PendingKnowledgeBitForReview,
  type PendingKnowledgeBitQuestionVariant,
  type PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

export type NoteMode = 'cloze' | 'list'

export interface NoteEditTarget {
  mode: NoteMode
  variantId: string
  text: string
}

export interface NoteDraft {
  problem: string | null
  body: string
  sentence: string
  previews: string[]
}

export function noteEditTarget(variants: PendingKnowledgeBitQuestionVariant[]): NoteEditTarget | null {
  const variant = variants.find(
    (candidate) =>
      (candidate.kind === 'cloze' || isOrderedListKind(candidate.kind)) && Boolean(candidate.sentence),
  )

  if (!variant?.sentence) {
    return null
  }

  return { mode: variant.kind === 'cloze' ? 'cloze' : 'list', variantId: variant.id, text: variant.sentence }
}

export function draftNote(mode: NoteMode, text: string): NoteDraft {
  const trimmed = text.trim()

  if (mode === 'list') {
    const parsed = parseOrderedListText(trimmed)

    return parsed.ok
      ? {
          problem: null,
          body: orderedListStatement(parsed.list),
          sentence: formatOrderedListText(parsed.list),
          previews: buildOrderedListCards(parsed.list).map((card) => card.prompt),
        }
      : { problem: ORDERED_LIST_ERROR_MESSAGES[parsed.error], body: '', sentence: '', previews: [] }
  }

  const parsed = parseCloze(trimmed)

  return parsed.ok
    ? {
        problem: null,
        body: stripClozeMarkers(parsed.note),
        sentence: trimmed,
        previews: buildClozeCards(parsed.note).map((card) => card.prompt),
      }
    : { problem: CLOZE_ERROR_MESSAGES[parsed.error], body: '', sentence: '', previews: [] }
}

export interface EditedNoteCardResult {
  id: string
  kind?: string
  prompt: string
  answer: string
}

export function applyNoteEdit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
  mode: NoteMode,
  draft: NoteDraft,
  cards: EditedNoteCardResult[],
): PendingKnowledgeSourceForReview[] {
  const updateBit = (bit: PendingKnowledgeBitForReview): PendingKnowledgeBitForReview => ({
    ...bit,
    body: draft.body,
    variants: cards.map((card) => ({
      id: card.id,
      kind: (card.kind ?? (mode === 'cloze' ? 'cloze' : 'list_step')) as PendingKnowledgeBitQuestionVariant['kind'],
      prompt: card.prompt,
      answer: card.answer,
      sentence: draft.sentence,
    })),
  })

  return sources.map((source) => ({
    ...source,
    bits: source.bits.map((bit) => (bit.id === bitId ? updateBit(bit) : bit)),
  }))
}
