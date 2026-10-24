// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

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
} from '../knowledge-bit/knowledge-bit-review.api'
import { finishTriageSession, startTriageSession } from './card-triage.api'

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
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedBulk = vi.mocked(bulkApproveKnowledgeBitsForReview)
const mockedStart = vi.mocked(startTriageSession)
const mockedFinish = vi.mocked(finishTriageSession)

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
    ;[mockedApprove, mockedReject, mockedBulk, mockedStart, mockedFinish].forEach((mock) =>
      mock.mockReset(),
    )
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
})
