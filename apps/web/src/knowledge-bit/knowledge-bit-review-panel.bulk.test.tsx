// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  bulkApproveKnowledgeBitsForReview,
  getPendingKnowledgeBitsForReview,
} from './knowledge-bit-review.api'
import {
  QUESTION_POLL_IDLE_LIMIT,
  QUESTION_POLL_INTERVAL_MS,
  QUESTION_POLL_MAX_ATTEMPTS,
} from './knowledge-bit-review-polling'

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
  gradeKnowledgeBitForReview: vi.fn(),
  updateKnowledgeBitFeedbackForReview: vi.fn(),
}))

const mockedBulk = vi.mocked(bulkApproveKnowledgeBitsForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)

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

describe('KnowledgeBitReviewPanel landing: bulk approval and polling', () => {
  beforeEach(() => {
    mockedBulk.mockReset()
    mockedGetPending.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should approve every bit that has questions in one call only after the reviewer confirms', async () => {
    mockedBulk.mockResolvedValue({ approved: ['b1', 'b2'], skipped: [] })
    render(
      <KnowledgeBitReviewPanel
        initialSources={[source('s1', [bit('b1', true), bit('b2', true), bit('b3', false)])]}
      />,
    )

    requestApproveAll()

    expect(screen.getByTestId('knowledge-bit-review-approve-all-confirm').textContent).toBe('Confirm')
    expect(screen.getByText('Approve 2 items?')).toBeDefined()
    expect(mockedBulk).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all-confirm'))

    await waitFor(() => {
      expect(mockedBulk).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['b1', 'b2'] } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('0 cards')
    })
    expect(screen.getByTestId('knowledge-bit-review-progress').textContent).toContain('0 of 1 ready')
  })

  it('should keep a skipped bit listed and tell the reviewer it was skipped', async () => {
    mockedBulk.mockResolvedValue({
      approved: ['b1'],
      skipped: [{ id: 'b2', reason: 'no_variant' }],
    })
    render(
      <KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true), bit('b2', true)])]} />,
    )

    requestApproveAll()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-bulk-message').textContent).toBe(
        'Approved 1. Skipped 1: 1 has no questions yet.',
      )
    })
    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('1 card')
  })

  it('should make a waiting bit approvable once its questions arrive, then stop polling', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([source('s1', [bit('b1', true)])])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', false)])]} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('1 card is')
    expect((screen.getByTestId('triage-start') as HTMLButtonElement).disabled).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * (QUESTION_POLL_IDLE_LIMIT + 1))
    })

    const callsWhenQuiet = mockedGetPending.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * 3)
    })

    expect(mockedGetPending).toHaveBeenCalledTimes(callsWhenQuiet)
  })

  it('should show a bit detected after the page opened, without a reload', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([
      source('s1', [bit('b1', true)]),
      source('s2', [bit('new1', true)]),
    ])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true)])]} />)

    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('1 card is')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('2 cards')
  })

  it('should stop showing the writing progress once polling gives up', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([source('s1', [bit('b1', false)])])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', false)])]} />)

    expect(screen.getByTestId('knowledge-bit-review-progress').textContent).toContain('Writing cards')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * (QUESTION_POLL_MAX_ATTEMPTS + 1))
    })

    expect(screen.queryByTestId('knowledge-bit-review-progress')).toBeNull()
  })

  it('should stop checking for new suggestions once the page has been quiet for a while', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([source('s1', [bit('b1', true)])])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true)])]} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * (QUESTION_POLL_IDLE_LIMIT + 1))
    })

    const callsWhenQuiet = mockedGetPending.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * 3)
    })

    expect(callsWhenQuiet).toBeGreaterThan(0)
    expect(mockedGetPending).toHaveBeenCalledTimes(callsWhenQuiet)
  })
})
