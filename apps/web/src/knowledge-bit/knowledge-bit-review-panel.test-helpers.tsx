import { fireEvent, screen } from '@testing-library/react'
import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
  TriageSessionResponse,
} from '@post-anki/shared'

export const TRIAGE_SESSION: TriageSessionResponse = {
  id: 's1',
  subjectId: null,
  status: 'open',
  startedAt: '2026-10-24T10:00:00.000Z',
  endedAt: null,
  acceptedCount: 0,
  rejectedCount: 0,
  feedbackText: null,
  notes: [],
}

export function makeBit(id: string, withVariant = true): PendingKnowledgeBitForReview {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    origin: 'extracted',
    isAiGenerated: false,
    sourceLinks: [],
    variants: withVariant
      ? [{ id: `var-${id}`, kind: 'wh_question', prompt: `Q ${id}`, answer: `A ${id}` }]
      : [],
  }
}

export function makeSource(
  id: string,
  bits: PendingKnowledgeBitForReview[],
  sourceText: string | null = 'text',
): PendingKnowledgeSourceForReview {
  return { knowledgeSourceId: id, sourceText, subjectName: null, bits }
}

export async function startTriage() {
  fireEvent.click(screen.getByTestId('triage-start'))
  await screen.findByTestId('knowledge-bit-focus-shell')
}
