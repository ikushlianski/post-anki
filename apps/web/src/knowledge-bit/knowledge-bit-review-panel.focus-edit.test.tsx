// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { startTriageSession } from '../card-triage/card-triage.api'
import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
  triageKnowledgeBitForReview,
  gradeKnowledgeBitForReview,
  updateKnowledgeBitFeedbackForReview,
} from './knowledge-bit-review.api'
import { makeBit, makeSource, startTriage, TRIAGE_SESSION } from './knowledge-bit-review-panel.test-helpers'

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
  triageKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
  gradeKnowledgeBitForReview: vi.fn(),
  updateKnowledgeBitFeedbackForReview: vi.fn(),
}))

vi.mock('../card-triage/card-triage.api', () => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedRestore = vi.mocked(restoreKnowledgeBitForReview)
const mockedKeep = vi.mocked(triageKnowledgeBitForReview)
const mockedEditVariant = vi.mocked(editKnowledgeBitQuestionVariantForReview)
const mockedUpdateFeedback = vi.mocked(updateKnowledgeBitFeedbackForReview)
const mockedGrade = vi.mocked(gradeKnowledgeBitForReview)
const mockedStart = vi.mocked(startTriageSession)

const TWO_CARDS: PendingKnowledgeSourceForReview[] = [
  makeSource('src-1', [makeBit('b1'), makeBit('b2')]),
]

function renderPanel(sources: PendingKnowledgeSourceForReview[] = TWO_CARDS) {
  return render(<KnowledgeBitReviewPanel initialSources={sources} />)
}

describe('KnowledgeBitReviewPanel focus mode edits and undo', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[mockedApprove, mockedReject, mockedRestore, mockedKeep, mockedEditVariant, mockedStart, mockedUpdateFeedback, mockedGrade].forEach(
      (mock) => mock.mockReset(),
    )
    mockedStart.mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
  })

  afterEach(() => {
    cleanup()
  })

  it('should save an edit by itself and approve with all variations afterwards', async () => {
    mockedEditVariant.mockResolvedValue({ ok: true, variantId: 'var-b1-2' })
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-b1'), {
      target: { value: 'Edited front?' },
    })

    await waitFor(
      () => {
        expect(mockedEditVariant).toHaveBeenCalledWith({
          data: { variantId: 'var-b1', prompt: 'Edited front?', answer: 'A b1' },
        })
      },
      { timeout: 4000 },
    )
    await waitFor(
      () => {
        expect((screen.getByTestId('knowledge-bit-focus-approve-b1') as HTMLButtonElement).disabled).toBe(false)
      },
      { timeout: 4000 },
    )

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } }), { timeout: 4000 })
    expect(mockedKeep).not.toHaveBeenCalled()
  })

  it('should block deciding while an edit is not saved', async () => {
    mockedEditVariant.mockRejectedValue(new Error('network'))
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-b1'), {
      target: { value: 'Will not save?' },
    })

    await waitFor(
      () => {
        expect(screen.getByTestId('knowledge-bit-review-autosave-status-var-b1').textContent).toContain(
          'Could not save',
        )
      },
      { timeout: 4000 },
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect((screen.getByTestId('knowledge-bit-focus-approve-b1') as HTMLButtonElement).disabled).toBe(true)
    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should undo the last two decisions in order with z and the Undo button', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
    mockedRestore.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-reject-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-reject-b2'))
    await screen.findByTestId('knowledge-bit-focus-done')

    fireEvent.keyDown(window, { key: 'z' })
    await screen.findByTestId('knowledge-bit-focus-reject-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-undo'))
    await screen.findByTestId('knowledge-bit-focus-reject-b1')

    expect(mockedRestore.mock.calls.map((call) => call[0])).toEqual([
      { data: { bitId: 'b2' } },
      { data: { bitId: 'b1' } },
    ])
  })

  it('should keep the decision and show an error when undo fails', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    mockedRestore.mockRejectedValue(new Error('network'))
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')
    fireEvent.keyDown(window, { key: 'z' })

    expect(await screen.findByText("Couldn't undo. Try again.")).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2')
  })

  it('should send a note typed before Reject to the feedback API on the rejection recorded for the card', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-9' })
    mockedUpdateFeedback.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-focus-note'), {
      target: { value: 'Too vague' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-reject-b1'))

    await waitFor(() => {
      expect(mockedUpdateFeedback).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-9', note: 'Too vague' },
      })
    })
  })

  it('should send a note typed before Approve through the grade API', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    mockedGrade.mockResolvedValue({ ok: true, feedbackId: 'fb-3' })
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-focus-note'), {
      target: { value: 'Nice and clear' },
    })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(mockedGrade).toHaveBeenCalledWith({
        data: { bitId: 'b1', rating: 3, note: 'Nice and clear' },
      })
    })
  })

  it('should not send a note and should clear it on the next card when none was typed', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')

    expect(mockedGrade).not.toHaveBeenCalled()
    expect((screen.getByTestId('knowledge-bit-focus-note') as HTMLTextAreaElement).value).toBe('')
  })

  it('should still decide the card when saving the note fails', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-9' })
    mockedUpdateFeedback.mockRejectedValue(new Error('network'))
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-focus-note'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-reject-b1'))

    expect(await screen.findByTestId('knowledge-bit-focus-approve-b2')).toBeDefined()
  })
})
