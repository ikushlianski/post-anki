import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

export const threeVariantBit: PendingKnowledgeBitForReview = {
  id: 'bit-spacing',
  body: 'Spaced repetition spaces out reviews as memory strengthens.',
  background: 'Each successful recall pushes the next review further into the future.',
  variants: [
    {
      id: 'var-spacing-basic',
      kind: 'basic',
      prompt: 'What does spaced repetition do with review timing?',
      answer: 'It spaces reviews further apart as recall gets stronger.',
    },
    {
      id: 'var-spacing-why',
      kind: 'wh_question',
      prompt: 'Why does the review interval grow after each successful recall?',
      answer:
        'Each correct recall shows the memory is holding, so reviewing less often still keeps it.',
    },
    {
      id: 'var-spacing-blank',
      kind: 'fill_in_the_blank',
      prompt: 'Spaced repetition schedules the next review ___ the memory is about to fade.',
      answer: 'just before',
    },
  ],
}

export const failedRecallBit: PendingKnowledgeBitForReview = {
  id: 'bit-failed-recall',
  body: 'A failed recall resets the interval to a short delay.',
  background: null,
  variants: [
    {
      id: 'var-failed-why',
      kind: 'wh_question',
      prompt: 'What happens to the interval after a failed recall?',
      answer: 'It drops back to a short delay so the card comes up again soon.',
    },
  ],
}

export const leechBit: PendingKnowledgeBitForReview = {
  id: 'bit-leech',
  body: 'A leech is a card you keep failing, and it should be rewritten.',
  background: 'Repeated lapses usually mean the card asks for too much at once.',
  variants: [
    {
      id: 'var-leech-basic',
      kind: 'basic',
      prompt: 'What is a leech?',
      answer: 'A card you keep failing, which should be split or rewritten.',
    },
  ],
}

export const waitingBit: PendingKnowledgeBitForReview = {
  id: 'bit-interleaving',
  body: 'Interleaving mixes related topics within one study session.',
  background: null,
  variants: [],
}

export const retrievalBit: PendingKnowledgeBitForReview = {
  id: 'bit-retrieval',
  body: 'Retrieval practice beats rereading for long-term memory.',
  background: 'Pulling an answer out of memory strengthens it more than seeing it again.',
  variants: [
    {
      id: 'var-retrieval-blank',
      kind: 'fill_in_the_blank',
      prompt: 'Retrieval practice beats rereading because pulling an answer out ___ it.',
      answer: 'strengthens',
    },
  ],
}

export const threeItemSource: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-memory-notes',
  sourceText:
    'Spaced repetition spaces out reviews as memory strengthens. A failed recall resets the interval to a short delay. Cards that keep failing are leeches and should be rewritten.',
  bits: [threeVariantBit, failedRecallBit, leechBit],
}

export const singleItemSource: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-study-habits',
  sourceText: null,
  bits: [retrievalBit],
}

export const sourceWithWaitingItem: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-interleaving',
  sourceText: 'Interleaving mixes related topics within one study session.',
  bits: [waitingBit],
}

export function realisticSources(): PendingKnowledgeSourceForReview[] {
  return [threeItemSource, singleItemSource]
}
