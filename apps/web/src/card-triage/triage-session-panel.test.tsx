// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from '../knowledge-bit/knowledge-bit-review-panel'
import { startTriageSession } from './card-triage.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  approveKnowledgeBitForReview: vi.fn(),
  rejectKnowledgeBitForReview: vi.fn(),
  restoreKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

vi.mock('./card-triage.api', () => ({
  startTriageSession: vi.fn(async () => ({
    ok: true,
    data: {
      id: 's1',
      subjectId: null,
      status: 'open',
      startedAt: '2026-10-24T10:00:00.000Z',
      endedAt: null,
      acceptedCount: 0,
      rejectedCount: 0,
      feedbackText: null,
      notes: [],
    },
  })),
  finishTriageSession: vi.fn(),
}))

const SOURCE: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'src-1',
  sourceText: 'Turbopuffer uses a WAL-first design.',
  subjectName: null,
  bits: [
    {
      id: 'bit-1',
      body: 'Turbopuffer writes to a WAL.',
      background: null,
      origin: 'extracted',
      isAiGenerated: false,
      sourceLinks: [],
      variants: [{ id: 'var-1', kind: 'wh_question', prompt: 'What first?', answer: 'A WAL write.' }],
    },
  ],
}

describe('Review panel triage mode', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('should hide the per-card grade button only while a triage session is open', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[SOURCE]} />)

    expect(screen.getByTestId('knowledge-bit-review-grade-bit-1')).toBeTruthy()

    fireEvent.keyDown(window, { key: 's' })
    await screen.findByRole('button', { name: 'Finish triage' })

    expect(vi.mocked(startTriageSession)).toHaveBeenCalled()
    expect(screen.queryByTestId('knowledge-bit-review-grade-bit-1')).toBeNull()
  })
})
