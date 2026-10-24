// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import { bulkApproveKnowledgeBitsForReview } from './knowledge-bit-review.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./knowledge-bit-review.api', () => ({
  approveKnowledgeBitForReview: vi.fn(),
  rejectKnowledgeBitForReview: vi.fn(),
  restoreKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedBulk = vi.mocked(bulkApproveKnowledgeBitsForReview)

function bit(id: string, withVariant: boolean) {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    origin: 'extracted' as const, isAiGenerated: false, sourceLinks: [],
    variants: withVariant
      ? [{ id: `var-${id}`, kind: 'wh_question' as const, prompt: `Q ${id}`, answer: `A ${id}` }]
      : [],
  }
}

function source(id: string, bits: ReturnType<typeof bit>[]): PendingKnowledgeSourceForReview {
  return { knowledgeSourceId: id, sourceText: 'text', subjectName: null, bits }
}

function requestApproveAll() {
  fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all'))
}

describe('KnowledgeBitReviewPanel bulk approval confirmation', () => {
  beforeEach(() => {
    mockedBulk.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should not approve anything when the reviewer cancels the bulk confirmation', () => {
    render(
      <KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true), bit('b2', true)])]} />,
    )

    requestApproveAll()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all-cancel'))

    expect(mockedBulk).not.toHaveBeenCalled()
    expect(screen.queryByTestId('knowledge-bit-review-approve-all-confirm')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-approve-all')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-item-b1')).toBeDefined()
  })

  it('should tell the reviewer why each skipped item was skipped', async () => {
    mockedBulk.mockResolvedValue({
      approved: ['b1'],
      skipped: [
        { id: 'b2', reason: 'already_decided' },
        { id: 'b3', reason: 'no_variant' },
      ],
    })
    render(
      <KnowledgeBitReviewPanel
        initialSources={[source('s1', [bit('b1', true), bit('b2', true), bit('b3', true)])]}
      />,
    )

    requestApproveAll()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all-confirm'))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(
        'Approved 1. Skipped 2: 1 already decided, 1 has no questions yet.',
      )
    })
  })

  it('should ask for confirmation before approving the whole source with Shift+A', () => {
    render(
      <KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true), bit('b2', true)])]} />,
    )

    fireEvent.keyDown(window, { key: 'A' })

    expect(screen.getByTestId('knowledge-bit-review-approve-source-confirm-s1')).toBeDefined()
    expect(mockedBulk).not.toHaveBeenCalled()
  })
})
