// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  bulkApproveKnowledgeBitsForReview,
  getPendingKnowledgeBitsForReview,
  rejectKnowledgeBitForReview,
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
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedBulk = vi.mocked(bulkApproveKnowledgeBitsForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)
const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)

function bit(id: string, withVariant: boolean) {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    variants: withVariant
      ? [{ id: `var-${id}`, kind: 'wh_question' as const, prompt: `Q ${id}`, answer: `A ${id}` }]
      : [],
  }
}

function source(id: string, bits: ReturnType<typeof bit>[]): PendingKnowledgeSourceForReview {
  return { knowledgeSourceId: id, sourceText: 'text', bits }
}

function requestApproveAll() {
  fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all'))
}

describe('KnowledgeBitReviewPanel bulk approval and keyboard', () => {
  beforeEach(() => {
    mockedBulk.mockReset()
    mockedGetPending.mockReset()
    mockedApprove.mockReset()
    mockedReject.mockReset()
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
      expect(screen.queryByTestId('knowledge-bit-review-item-b1')).toBeNull()
    })
    expect(mockedBulk).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['b1', 'b2'] } })
    expect(screen.getByTestId('knowledge-bit-review-item-b3')).toBeDefined()
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
    expect(screen.getByTestId('knowledge-bit-review-item-b2')).toBeDefined()
  })

  it('should approve only the chosen source with its own button', async () => {
    mockedBulk.mockResolvedValue({ approved: ['a1', 'a2'], skipped: [] })
    render(
      <KnowledgeBitReviewPanel
        initialSources={[
          source('s1', [bit('a1', true), bit('a2', true)]),
          source('s2', [bit('c1', true), bit('c2', true)]),
        ]}
      />,
    )

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-source-s1'))

    expect(screen.getByText('Approve 2 items?')).toBeDefined()
    expect(mockedBulk).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-source-confirm-s1'))

    await waitFor(() => {
      expect(mockedBulk).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['a1', 'a2'] } })
    })
  })

  it('should approve the focused suggestion with the a key and move focus with j', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    render(
      <KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true), bit('b2', true)])]} />,
    )

    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'a' })

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b2' } })
    })
  })

  it('should reject the focused suggestion with the r key', async () => {
    mockedReject.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true)])]} />)

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    })
  })

  it('should not approve with the a key while a suggestion has no questions yet', () => {
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', false)])]} />)

    fireEvent.keyDown(window, { key: 'a' })

    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should ignore shortcut keys typed into an editor field', () => {
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', true)])]} />)

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-bit-button-b1'))
    fireEvent.keyDown(screen.getByTestId('knowledge-bit-review-edit-body-b1'), { key: 'a' })

    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should make a waiting bit approvable once its questions arrive, then stop polling', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([source('s1', [bit('b1', true)])])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', false)])]} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS)
    })

    expect(
      (screen.getByTestId('knowledge-bit-review-approve-b1') as HTMLButtonElement).disabled,
    ).toBe(false)

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

    expect(screen.queryByTestId('knowledge-bit-review-item-new1')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-item-new1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-item-b1')).toBeDefined()
  })

  it('should stop promising automatic checks and ask for a reload once polling gives up', async () => {
    vi.useFakeTimers()
    mockedGetPending.mockResolvedValue([source('s1', [bit('b1', false)])])
    render(<KnowledgeBitReviewPanel initialSources={[source('s1', [bit('b1', false)])]} />)

    expect(screen.getByTestId('knowledge-bit-review-no-variants-b1').textContent).toBe(
      'Writing cards…',
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUESTION_POLL_INTERVAL_MS * (QUESTION_POLL_MAX_ATTEMPTS + 1))
    })

    expect(screen.getByTestId('knowledge-bit-review-no-variants-b1').textContent).toBe(
      'Still waiting. Reload the page to check again.',
    )
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
