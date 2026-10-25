// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TriageDecisionResponse } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from '../knowledge-bit/knowledge-bit-review-panel'
import {
  makeBit,
  makeSource,
  startTriage,
  TRIAGE_SESSION,
} from '../knowledge-bit/knowledge-bit-review-panel.test-helpers'
import {
  approveKnowledgeBitForReview,
  bulkApproveKnowledgeBitsForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
} from '../knowledge-bit/knowledge-bit-review.api'
import {
  deleteTriageDecision,
  discardTriageSession,
  finishTriageSession,
  listTriageDecisions,
  putTriageDecision,
  startTriageSession,
} from './card-triage.api'

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
  gradeKnowledgeBitForReview: vi.fn(),
  updateKnowledgeBitFeedbackForReview: vi.fn(),
}))

vi.mock('./card-triage.api', () => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
  discardTriageSession: vi.fn(),
  putTriageDecision: vi.fn(),
  deleteTriageDecision: vi.fn(),
  listTriageDecisions: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedBulk = vi.mocked(bulkApproveKnowledgeBitsForReview)
const mockedStart = vi.mocked(startTriageSession)
const mockedFinish = vi.mocked(finishTriageSession)
const mockedPut = vi.mocked(putTriageDecision)
const mockedDelete = vi.mocked(deleteTriageDecision)
const mockedDiscard = vi.mocked(discardTriageSession)
const mockedList = vi.mocked(listTriageDecisions)

const DECISION_ROW: TriageDecisionResponse = {
  id: 'ctd_1',
  sessionId: 's1',
  bitId: 'b1',
  verdict: 'approved',
  reasonCode: null,
  note: null,
  decidedAt: '2026-10-24T10:01:00.000Z',
  orderIndex: 0,
  dwellMs: null,
  front: 'Front',
  back: 'Back',
  variants: [],
  undoneAt: null,
  source: 'client',
}

function renderPanel() {
  return render(
    <KnowledgeBitReviewPanel
      initialSources={[makeSource('src-1', [makeBit('b1'), makeBit('b2')])]}
    />,
  )
}

describe('Review panel triage session lifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[
      mockedApprove,
      mockedReject,
      mockedBulk,
      mockedStart,
      mockedFinish,
      mockedPut,
      mockedDelete,
      mockedDiscard,
      mockedList,
    ].forEach((mock) => mock.mockReset())
    mockedPut.mockResolvedValue({ ok: true, data: DECISION_ROW })
    mockedDelete.mockResolvedValue({ ok: true, data: DECISION_ROW })
    mockedList.mockResolvedValue({ ok: true, data: [] })
    mockedStart.mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
    mockedApprove.mockResolvedValue({ ok: true })
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
  })

  afterEach(() => {
    cleanup()
  })

  it('should open the feedback step inside focus mode on Finish and the result on the landing after Save', async () => {
    mockedFinish.mockResolvedValue({
      ok: true,
      data: { ...TRIAGE_SESSION, status: 'distilled', acceptedCount: 1, rejectedCount: 0 },
    })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-finish'))

    expect(screen.getByTestId('triage-feedback-panel')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-focus-shell')).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-focus-approve-b2')).toBeNull()

    fireEvent.click(screen.getByTestId('triage-feedback-save'))

    expect(await screen.findByTestId('triage-result')).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-focus-shell')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-landing')).toBeDefined()
  })

  it('should finish with the f key and keep undecided cards pending on the landing', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: { ...TRIAGE_SESSION, status: 'distilled' } })
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.click(await screen.findByTestId('triage-feedback-skip'))

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-focus-shell')).toBeNull()
    })
    expect(screen.getByTestId('knowledge-bit-review-count').textContent).toContain('2 cards')
    expect(screen.queryByText('Body b1')).toBeNull()
  })

  it('should resume straight into focus mode after a reload with a session still open', async () => {
    window.localStorage.setItem('post-anki:open-triage-session', 's1')
    renderPanel()

    expect(await screen.findByTestId('knowledge-bit-focus-shell')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('should leave cards decided in a finished session out of Approve all ready', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: { ...TRIAGE_SESSION, status: 'distilled' } })
    mockedBulk.mockResolvedValue({ approved: ['b2'], skipped: [] })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-reject-b1'))
    await screen.findByTestId('knowledge-bit-focus-reject-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-finish'))
    fireEvent.click(await screen.findByTestId('triage-feedback-save'))
    fireEvent.click(await screen.findByTestId('triage-result-close'))

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all'))
    expect(screen.getByText('Approve 1 item?')).toBeDefined()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all-confirm'))

    await waitFor(() => {
      expect(mockedBulk).toHaveBeenCalledWith({ data: { knowledgeBitIds: ['b2'] } })
    })
  })

  it('should record each decision on the session with the measured time on the card', async () => {
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-reject-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-reject-b2'))

    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(2))
    expect(mockedPut).toHaveBeenNthCalledWith(1, {
      data: { sessionId: 's1', bitId: 'b1', verdict: 'approved', dwellMs: expect.any(Number) },
    })
    expect(mockedPut).toHaveBeenNthCalledWith(2, {
      data: { sessionId: 's1', bitId: 'b2', verdict: 'rejected', dwellMs: expect.any(Number) },
    })
  })

  it('should send the typed note with the decision', async () => {
    renderPanel()
    await startTriage()

    fireEvent.change(screen.getByTestId('knowledge-bit-focus-note'), {
      target: { value: 'nice and short' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(1))
    expect(mockedPut).toHaveBeenCalledWith({
      data: expect.objectContaining({ bitId: 'b1', verdict: 'approved', note: 'nice and short' }),
    })
  })

  it('should remove the recorded decision from the session when the user undoes it', async () => {
    vi.mocked(restoreKnowledgeBitForReview).mockResolvedValue(undefined as never)
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-undo'))

    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith({ data: { sessionId: 's1', bitId: 'b1' } }),
    )
  })

  it('should keep the queue moving and show a small notice when recording a decision fails', async () => {
    mockedPut.mockResolvedValue({ ok: false, error: 'boom', status: 500 })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))

    expect((await screen.findByTestId('triage-sync-notice')).textContent).toContain('1 decision not saved')
    expect(screen.getByTestId('knowledge-bit-focus-approve-b2')).toBeDefined()
  })

  it('should send how many cards were left undecided when finishing early', async () => {
    mockedFinish.mockResolvedValue({ ok: true, data: { ...TRIAGE_SESSION, status: 'distilled' } })
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-b1'))
    await screen.findByTestId('knowledge-bit-focus-approve-b2')
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-finish'))
    fireEvent.click(await screen.findByTestId('triage-feedback-skip'))

    await screen.findByTestId('knowledge-bit-review-landing')
    expect(mockedFinish).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: 's1', undecidedCount: 1 }),
    })
  })
})
