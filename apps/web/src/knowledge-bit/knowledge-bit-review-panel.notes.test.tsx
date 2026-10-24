// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  getPendingKnowledgeBitsForReview,
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
  updateKnowledgeBitFeedbackForReview: vi.fn(),
  setKnowledgeBitGradesForReview: vi.fn(),
  setSourceExtractionGradeForReview: vi.fn(),
  getKnowledgeBitModelSuggestionForAdmin: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedUpdate = vi.mocked(updateKnowledgeBitFeedbackForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)

function makeSource(): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: 'src-1',
    sourceText: 'Some pasted text.',
    subjectName: null,
    extractionRun: 1,
    extractionGrade: null,
    bits: ['bit-1', 'bit-2'].map((id, index) => ({
      id,
      body: `Claim ${index + 1}.`,
      background: null,
      feedback: {
        feedbackId: `fb-${index + 1}`,
        verdict: 'rejected' as const,
        rating: null,
        wordingRating: null,
      },
      origin: 'extracted' as const, isAiGenerated: false, sourceLinks: [],
      variants: [{ id: `var-${index + 1}`, kind: 'basic', prompt: `Question ${index + 1}?`, answer: `Answer ${index + 1}.` }],
    })),
  }
}

const NOTE = 'knowledge-bit-review-decision-note'

function openGrade(bitId = 'bit-1') {
  fireEvent.click(screen.getByTestId(`knowledge-bit-review-grade-${bitId}`))
}

function typeNote(value: string) {
  const field = screen.getByTestId(NOTE)

  fireEvent.focus(field)
  fireEvent.change(field, { target: { value } })
}

describe('notes typed in the feedback box opened from a card', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedGetPending.mockResolvedValue([])
    mockedUpdate.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should save a note typed before any reason was chosen when the field loses focus', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade()
    await screen.findByTestId(NOTE)
    typeNote('no subject in the question')
    fireEvent.blur(screen.getByTestId(NOTE))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-1', note: 'no subject in the question' } }),
    )
  })

  it('should keep the strip open while the note field is focused and save the note when it is dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade()
    await screen.findByTestId(NOTE)
    typeNote('a long thought')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_STRIP_VISIBLE_MS * 2)
    })

    expect(screen.getByTestId('knowledge-bit-review-decision-strip')).toBeDefined()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-decision-dismiss'))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-1', note: 'a long thought' } }),
    )
  })

  it('should not close the strip on its own while the note holds text that was not saved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockedUpdate.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade()
    await screen.findByTestId(NOTE)
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'unsaved words' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_STRIP_VISIBLE_MS + 500)
    })

    expect(screen.getByTestId('knowledge-bit-review-decision-strip')).toBeDefined()
  })

  it('should save the pending note of the first card when grading is opened on another card', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade('bit-1')
    await screen.findByTestId(NOTE)
    fireEvent.change(screen.getByTestId(NOTE), { target: { value: 'first note' } })
    openGrade('bit-2')

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { feedbackId: 'fb-1', note: 'first note' } }),
    )
  })

  it('should send an empty note when the reviewer clears a note that was saved before', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade()
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-decision-reason-bad_format'))
    typeNote('saved words')
    fireEvent.blur(screen.getByTestId(NOTE))
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'bad_format', note: 'saved words' },
      }),
    )

    typeNote('')
    fireEvent.blur(screen.getByTestId(NOTE))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'bad_format', note: '' },
      }),
    )
  })

  it('should not show a save failure of an earlier decision inside the strip of a newer one', async () => {
    let failFirst: (value: { ok: true }) => void = () => undefined
    const first = new Promise<{ ok: true }>((_resolve, reject) => {
      failFirst = () => reject(new Error('offline'))
    })

    mockedUpdate.mockReturnValueOnce(first)
    render(<KnowledgeBitReviewPanel initialSources={[makeSource()]} />)

    openGrade('bit-1')
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-decision-reason-bad_format'))
    openGrade('bit-2')
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-review-decision-strip')).toBeDefined())
    await act(async () => {
      failFirst({ ok: true })
      await Promise.resolve()
    })

    expect(screen.queryByTestId('knowledge-bit-review-decision-error')).toBeNull()
  })
})
