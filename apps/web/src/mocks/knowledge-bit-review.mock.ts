import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

export const threeVariantBit: PendingKnowledgeBitForReview = {
  id: 'bit-spacing',
  body: 'Spaced repetition spaces out reviews as memory strengthens.',
  background: 'Each successful recall pushes the next review further into the future.',
  origin: 'extracted', isAiGenerated: false, sourceLinks: [],
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
  origin: 'extracted', isAiGenerated: false, sourceLinks: [],
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
  origin: 'extracted', isAiGenerated: false, sourceLinks: [],
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
  origin: 'extracted', isAiGenerated: false, sourceLinks: [],
  variants: [],
}

export const retrievalBit: PendingKnowledgeBitForReview = {
  id: 'bit-retrieval',
  body: 'Retrieval practice beats rereading for long-term memory.',
  background: 'Pulling an answer out of memory strengthens it more than seeing it again.',
  origin: 'extracted', isAiGenerated: false, sourceLinks: [],
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
  subjectName: null,
  bits: [threeVariantBit, failedRecallBit, leechBit],
}

export const singleItemSource: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-study-habits',
  sourceText: null,
  subjectName: null,
  bits: [retrievalBit],
}

export const sourceWithWaitingItem: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-interleaving',
  sourceText: 'Interleaving mixes related topics within one study session.',
  subjectName: null,
  bits: [waitingBit],
}

export function realisticSources(): PendingKnowledgeSourceForReview[] {
  return [threeItemSource, singleItemSource]
}

export const fullyReviewedSource: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-fully-reviewed',
  sourceText: 'All bits from this source have been reviewed.',
  subjectName: 'Learning',
  bits: [],
}

export const processedSource: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'source-processed',
  sourceText: 'This source has been marked as processed.',
  subjectName: 'Learning',
  processedAt: new Date('2025-01-01T12:00:00Z'),
  bits: [],
}
