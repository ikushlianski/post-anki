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
  discardTriageSession: vi.fn(),
  putTriageDecision: vi.fn(),
  deleteTriageDecision: vi.fn(),
  listTriageDecisions: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedRestore = vi.mocked(restoreKnowledgeBitForReview)
const mockedKeep = vi.mocked(triageKnowledgeBitForReview)
const mockedEditVariant = vi.mocked(editKnowledgeBitQuestionVariantForReview)
const mockedStart = vi.mocked(startTriageSession)

const TWO_CARDS: PendingKnowledgeSourceForReview[] = [
  makeSource('src-1', [makeBit('b1'), makeBit('b2')]),
]

function renderPanel(sources: PendingKnowledgeSourceForReview[] = TWO_CARDS) {
  return render(<KnowledgeBitReviewPanel initialSources={sources} />)
}

describe('KnowledgeBitReviewPanel before and during a triage session', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[mockedApprove, mockedReject, mockedRestore, mockedKeep, mockedEditVariant, mockedStart].forEach(
      (mock) => mock.mockReset(),
    )
    mockedStart.mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
  })

  afterEach(() => {
    cleanup()
  })

  it('should show an empty state and a disabled Start when nothing is pending', () => {
    renderPanel([])

    expect(screen.getByTestId('knowledge-bit-review-empty-state')).toBeDefined()
    expect((screen.getByTestId('triage-start') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should show no card text and a count of waiting cards until Start triage is pressed', () => {
    renderPanel()

    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('2 cards')
    expect(screen.queryByText('Body b1')).toBeNull()
    expect(screen.queryByText('Q b1')).toBeNull()
    expect(screen.queryByTestId('knowledge-bit-focus-shell')).toBeNull()
  })

  it('should not decide any card with a, r or the arrow keys before triage starts', () => {
    renderPanel()

    ;['a', 'r', 'x', 'ArrowRight', 'ArrowLeft'].forEach((key) => fireEvent.keyDown(window, { key }))

    expect(mockedApprove).not.toHaveBeenCalled()
    expect(mockedReject).not.toHaveBeenCalled()
  })

  it('should open full-screen focus mode with the first card only after Start triage', async () => {
    renderPanel()

    await startTriage()

    expect(mockedStart).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
    expect(screen.queryByText('Body b2')).toBeNull()
  })

  it('should start with the s key', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 's' })

    expect(await screen.findByTestId('knowledge-bit-focus-shell')).toBeDefined()
  })

  it('should stay on the landing and show the error when starting fails', async () => {
    mockedStart.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    renderPanel()

    fireEvent.click(screen.getByTestId('triage-start'))

    expect(await screen.findByText("Couldn't start triage. Try again.")).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-focus-shell')).toBeNull()
  })

  it('should approve with the Approve button and show the next card', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2')
    })
    expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(mockedKeep).not.toHaveBeenCalled()
  })

  it('should approve with ArrowRight and reject with ArrowLeft', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } }))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'b2' } }))
  })

  it('should decide a held key once', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })

    await waitFor(() => expect(mockedApprove).toHaveBeenCalled())
    expect(mockedApprove).toHaveBeenCalledTimes(1)
  })

  it('should ignore decision keys typed into the card fields', async () => {
    renderPanel()
    await startTriage()

    fireEvent.keyDown(screen.getAllByRole('textbox')[0]!, { key: 'a' })
    fireEvent.keyDown(screen.getAllByRole('textbox')[0]!, { key: 'ArrowRight' })

    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should skip a card that has no questions yet and tell how many are being written', async () => {
    renderPanel([makeSource('src-1', [makeBit('w1', false), makeBit('b1')])])
    await startTriage()

    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
    expect(screen.getByTestId('knowledge-bit-focus-waiting').textContent).toContain('1 waiting')
  })

  it('should announce each decision politely with the number left', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-announcer-polite').textContent).toBe(
        'Approved, 1 left',
      )
    })
  })

  it('should show a per-card error and keep the card when approve fails', async () => {
    mockedApprove.mockRejectedValue(new Error('network'))
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    expect((await screen.findByTestId('knowledge-bit-review-error-b1')).textContent).toBe(
      "Couldn't approve. Try again.",
    )
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
  })

  it('should show All cards decided with Finish once the last card is decided', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    renderPanel([makeSource('src-1', [makeBit('b1')])])
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    expect((await screen.findByTestId('knowledge-bit-focus-done')).textContent).toContain(
      'All cards decided',
    )
    expect(screen.getByTestId('knowledge-bit-focus-done-finish')).toBeDefined()
  })

  it('should not allow starting triage while every card is still being written', async () => {
    renderPanel([makeSource('src-1', [makeBit('w1', false)])])

    expect((screen.getByTestId('triage-start') as HTMLButtonElement).disabled).toBe(true)
  })
})
