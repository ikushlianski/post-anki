// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeBitFeedback, PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  gradeKnowledgeBitForReview,
  getPendingKnowledgeBitsForReview,
  rejectKnowledgeBitForReview,
  updateKnowledgeBitFeedbackForReview,
} from './knowledge-bit-review.api'
import { DECISION_STRIP_VISIBLE_MS } from './knowledge-bit-review-decision-feedback'

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
  updateKnowledgeBitFeedbackForReview: vi.fn(),
  gradeKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedUpdate = vi.mocked(updateKnowledgeBitFeedbackForReview)
const mockedGrade = vi.mocked(gradeKnowledgeBitForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)

type FeedbackByBit = Record<string, PendingKnowledgeBitFeedback>

const REJECTED_FB1: PendingKnowledgeBitFeedback = {
  feedbackId: 'fb-1',
  verdict: 'rejected',
  rating: null,
  wordingRating: null,
}
const APPROVED_FB2: PendingKnowledgeBitFeedback = {
  feedbackId: 'fb-2',
  verdict: 'approved',
  rating: null,
  wordingRating: null,
}
const STRIP = 'knowledge-bit-review-decision-strip'
const NOTE = 'knowledge-bit-review-decision-note'

function makeSource(feedback: FeedbackByBit): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: 'src-1',
    sourceText: 'Some pasted text.',
    subjectName: null,
    bits: ['bit-1', 'bit-2'].map((id, index) => ({
      id,
      body: `Claim ${index + 1}.`,
      background: null,
      feedback: feedback[id] ?? null,
      origin: 'extracted' as const,
      isAiGenerated: false,
      sourceLinks: [],
      variants: [
        { id: `var-${index + 1}`, kind: 'basic', prompt: `Question ${index + 1}?`, answer: `Answer ${index + 1}.` },
      ],
    })),
  }
}

function renderPanel(feedback: FeedbackByBit = {}) {
  return render(<KnowledgeBitReviewPanel initialSources={[makeSource(feedback)]} />)
}

function openGrade(bitId: string) {
  fireEvent.click(screen.getByTestId(`knowledge-bit-review-grade-${bitId}`))
}

describe('grading a card on demand', () => {
  beforeEach(() => {
    mockedReject.mockReset()
    mockedApprove.mockReset()
    mockedUpdate.mockReset()
    mockedGrade.mockReset()
    mockedGrade.mockResolvedValue({ ok: true, feedbackId: 'fb-new' })
    mockedGetPending.mockReset()
    mockedGetPending.mockResolvedValue([])
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
    mockedApprove.mockResolvedValue({ ok: true })
    mockedUpdate.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should reject at once with one tap and not open the feedback box', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-status-bit-1').textContent).toBe('Rejected')
    })
    expect(screen.queryByTestId(STRIP)).toBeNull()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('should approve without opening the feedback box', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-status-bit-1').textContent).toBe('Approved')
    })
    expect(screen.queryByTestId(STRIP)).toBeNull()
  })

  it('should not open the feedback box after the r key rejects the focused card', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    expect(screen.queryByTestId(STRIP)).toBeNull()
  })

  it('should offer a grade control of at least 44px on every card', () => {
    renderPanel()

    for (const bitId of ['bit-1', 'bit-2']) {
      const button = screen.getByTestId(`knowledge-bit-review-grade-${bitId}`)

      expect(button.textContent).toBe('Grade this card')
      expect(button.className).toContain('min-h-11')
    }
  })

  it('should open the feedback box only when the learner asks to grade a card', () => {
    renderPanel({ 'bit-2': APPROVED_FB2 })

    expect(screen.queryByTestId(STRIP)).toBeNull()

    openGrade('bit-2')

    expect(screen.getByTestId(STRIP)).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-review-decision-reason-other')).toBeNull()
  })

  it('should save the grade chosen from the card on its recorded decision', async () => {
    renderPanel({ 'bit-2': APPROVED_FB2 })

    openGrade('bit-2')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-4'))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-2', rating: 4 } })
    })
  })

  it('should grade a pending card with no decision through the grades route', async () => {
    renderPanel()

    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-4'))

    await waitFor(() => {
      expect(mockedGrade).toHaveBeenCalledWith({ data: { bitId: 'bit-1', rating: 4 } })
    })
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('should update the grade it just created instead of creating a second one', async () => {
    renderPanel()

    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-4'))
    await waitFor(() => expect(mockedGrade).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-2'))
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-new', rating: 2 } })
    })

    expect(mockedGrade).toHaveBeenCalledTimes(1)
  })

  it('should send the typed note together with the first grade of a pending card', async () => {
    renderPanel()

    openGrade('bit-1')
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'clear question' } })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-5'))

    await waitFor(() => {
      expect(mockedGrade).toHaveBeenCalledWith({
        data: { bitId: 'bit-1', rating: 5, note: 'clear question' },
      })
    })
  })

  it('should show an error when grading a pending card fails', async () => {
    mockedGrade.mockRejectedValue(new Error('offline'))
    renderPanel()

    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-3'))

    expect(await screen.findByTestId('knowledge-bit-review-decision-error')).toBeDefined()
  })

  it('should grade a card that was just rejected on the rejection recorded for it', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    await screen.findByTestId('knowledge-bit-review-status-bit-1')
    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-reason-bad_format'))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'bad_format' },
      })
    })
    expect(mockedGrade).not.toHaveBeenCalled()
  })

  it('should offer the rejection reasons when grading a card that was rejected', async () => {
    renderPanel({ 'bit-1': REJECTED_FB1 })

    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-reason-meta_wording'))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'meta_wording' },
      })
    })
  })

  it('should send the note when the note field loses focus after typing', async () => {
    renderPanel({ 'bit-1': REJECTED_FB1 })

    openGrade('bit-1')
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'says according to the text' } })
    fireEvent.blur(screen.getByTestId(NOTE))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-1', note: 'says according to the text' },
      })
    })
  })

  it('should add a note after the reason was already chosen', async () => {
    renderPanel({ 'bit-1': REJECTED_FB1 })

    openGrade('bit-1')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-reason-too_vague_or_no_context'))
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'no subject' } })
    fireEvent.keyDown(screen.getByTestId(NOTE), { key: 'Enter' })

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenLastCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'too_vague_or_no_context', note: 'no subject' },
      })
    })
  })

  it('should hide the feedback box when it is ignored without saving anything', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel({ 'bit-1': REJECTED_FB1 })
    openGrade('bit-1')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_STRIP_VISIBLE_MS + 100)
    })

    expect(screen.queryByTestId(STRIP)).toBeNull()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('should keep the feedback box open while the learner is still typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel({ 'bit-1': REJECTED_FB1 })
    openGrade('bit-1')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_STRIP_VISIBLE_MS - 1000)
    })
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'x' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_STRIP_VISIBLE_MS - 1000)
    })

    expect(screen.getByTestId(STRIP)).toBeDefined()
  })

  it('should grade the second card when grading is opened on another card', async () => {
    renderPanel({ 'bit-1': REJECTED_FB1, 'bit-2': APPROVED_FB2 })

    openGrade('bit-1')
    openGrade('bit-2')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-quality-2'))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-2', rating: 2 } })
    })
  })
})
