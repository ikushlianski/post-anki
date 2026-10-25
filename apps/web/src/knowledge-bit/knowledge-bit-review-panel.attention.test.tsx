// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import { makeBit, makeSource } from './knowledge-bit-review-panel.test-helpers'
import { PENDING_REVIEW_CHANGED_EVENT } from './knowledge-bit-review-events'
import {
  discardKnowledgeSourceForReview,
  getKnowledgeSourceRegenerationForReview,
  getPendingKnowledgeBitsForReview,
  getPendingKnowledgeBitsWithAttentionForReview,
  regenerateKnowledgeSourceForReview,
} from './knowledge-bit-review.api'
import { REGENERATION_POLL_INTERVAL_MS } from './knowledge-bit-review-regeneration'

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
  getPendingKnowledgeBitsWithAttentionForReview: vi.fn(),
  gradeKnowledgeBitForReview: vi.fn(),
  updateKnowledgeBitFeedbackForReview: vi.fn(),
  regenerateKnowledgeSourceForReview: vi.fn(),
  getKnowledgeSourceRegenerationForReview: vi.fn(),
  discardKnowledgeSourceForReview: vi.fn(),
}))

const mockedRegenerate = vi.mocked(regenerateKnowledgeSourceForReview)
const mockedStatus = vi.mocked(getKnowledgeSourceRegenerationForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)
const mockedGetAttention = vi.mocked(getPendingKnowledgeBitsWithAttentionForReview)
const mockedDiscard = vi.mocked(discardKnowledgeSourceForReview)

function noticeSource(id: string, reason = 'no_valid_items'): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: id,
    sourceText: null,
    subjectName: null,
    bits: [],
    attention: {
      knowledgeSourceId: id,
      kind: 'failed',
      reason,
      firstWords: `Note ${id}`,
      sourceText: `Full text of note ${id}`,
      since: new Date(Date.now() - 60_000).toISOString(),
    },
  }
}

function renderPanel(sources: PendingKnowledgeSourceForReview[]) {
  return render(<KnowledgeBitReviewPanel initialSources={sources} />)
}

describe('KnowledgeBitReviewPanel attention notices', () => {
  beforeEach(() => {
    mockedRegenerate.mockReset()
    mockedStatus.mockReset()
    mockedGetPending.mockReset()
    mockedGetAttention.mockReset()
    mockedDiscard.mockReset()
    mockedGetPending.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should show a failed note as a notice instead of the empty message', () => {
    renderPanel([noticeSource('s1')])

    expect(screen.getByTestId('knowledge-bit-review-attention-s1')).toBeDefined()
    expect(screen.getByText('Needs attention (1)')).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-review-empty-state')).toBeNull()
  })

  it('should keep showing cards next to a notice so the reviewer can still see them', () => {
    renderPanel([noticeSource('s1'), makeSource('s2', [makeBit('b1')])])

    expect(screen.getByTestId('knowledge-bit-review-attention-s1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('1 card is waiting')
  })

  it('should show the empty message when there are no notices and no cards', () => {
    renderPanel([])

    expect(screen.getByTestId('knowledge-bit-review-empty-state')).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-review-attention')).toBeNull()
  })

  it('should show Retrying after Retry now and remove the notice once the new run finishes', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 0 })
    renderPanel([noticeSource('s1')])

    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-retry'))
    })

    expect(mockedRegenerate).toHaveBeenCalledWith({ data: { sourceId: 's1' } })
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-status').textContent).toBe('Retrying…')

    mockedStatus.mockResolvedValue({ status: 'done', failureReason: null })
    mockedGetPending.mockResolvedValue([makeSource('s1', [makeBit('n1')])])
    mockedGetAttention.mockResolvedValue([makeSource('s1', [makeBit('n1')])])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.queryByTestId('knowledge-bit-review-attention-s1')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('1 card is waiting')
  })

  it('should show a fresh notice with the new reason when the retry fails again', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 0 })
    renderPanel([noticeSource('s1')])

    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-retry'))
    })

    mockedStatus.mockResolvedValue({ status: 'failed', failureReason: 'source_empty' })
    mockedGetAttention.mockResolvedValue([noticeSource('s1', 'source_empty')])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.getAllByTestId('knowledge-bit-review-attention-s1')).toHaveLength(1)
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-reason').textContent).toBe(
      'This note has no text.',
    )
    expect(screen.queryByTestId('knowledge-bit-review-attention-s1-status')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-retry')).toBeDefined()
  })

  it('should keep the notice and say so when a retry cannot start', async () => {
    mockedRegenerate.mockRejectedValue(new Error('boom'))
    renderPanel([noticeSource('s1')])

    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-retry'))
    })

    expect(screen.getByTestId('knowledge-bit-review-attention-s1-error').textContent).toBe(
      "Couldn't start. Try again.",
    )
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-retry')).toBeDefined()
  })

  it('should send the edited text when Edit text and retry is confirmed', async () => {
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 0 })
    renderPanel([noticeSource('s1')])

    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-edit'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-attention-s1-text'), {
      target: { value: 'Better text' },
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-edit-submit'))
    })

    expect(mockedRegenerate).toHaveBeenCalledWith({ data: { sourceId: 's1', text: 'Better text' } })
  })

  it('should remove the notice and refresh the sidebar count after a confirmed discard', async () => {
    const onChanged = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, onChanged)
    mockedDiscard.mockResolvedValue({
      counts: {
        feedback: 0,
        facts: 0,
        knowledgeBits: 0,
        questionVariants: 0,
        variantAttempts: 0,
        schedules: 0,
        reviews: 0,
        tagAssignments: 0,
        knowledgeSources: 1,
        extractionGrades: 0,
        topicCardVariants: 0,
        triageSessions: 0,
      },
    })
    renderPanel([noticeSource('s1')])

    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard-confirm'))
    })
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, onChanged)

    expect(mockedDiscard).toHaveBeenCalledWith({ data: { sourceId: 's1' } })
    expect(screen.queryByTestId('knowledge-bit-review-attention-s1')).toBeNull()
    expect(onChanged).toHaveBeenCalled()
  })

  it('should keep the notice when the discard request fails', async () => {
    mockedDiscard.mockRejectedValue(new Error('boom'))
    renderPanel([noticeSource('s1')])

    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard-confirm'))
    })

    expect(screen.getByTestId('knowledge-bit-review-attention-s1-discard-error')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-attention-s1')).toBeDefined()
  })
})
