// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { startTriageSession } from '../card-triage/card-triage.api'
import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  rejectKnowledgeBitForReview,
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
const mockedKeep = vi.mocked(triageKnowledgeBitForReview)

const PHRASE: PendingKnowledgeBitForReview = {
  ...makeBit('p1'),
  answerChoice: true,
  variants: ['s1', 's2', 's3'].map((id) => ({
    id,
    kind: 'basic',
    prompt: `Moment ${id}`,
    answer: `Sentence ${id}`,
  })),
}

function renderPanel() {
  return render(
    <KnowledgeBitReviewPanel initialSources={[makeSource('src-1', [PHRASE, makeBit('b2')])]} />,
  )
}

describe('KnowledgeBitReviewPanel sentence options', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[mockedApprove, mockedReject, mockedKeep].forEach((mock) => mock.mockReset())
    vi.mocked(startTriageSession).mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
    mockedKeep.mockResolvedValue({ ok: true, droppedVariantIds: [] } as never)
    mockedApprove.mockResolvedValue({ ok: true })
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
  })

  afterEach(cleanup)

  it('should accept only the highlighted sentence on Return', async () => {
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(mockedKeep).toHaveBeenCalledWith({ data: { bitId: 'p1', keepVariantIds: ['s2'] } }))
    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should show the front of the highlighted option as the arrows move', async () => {
    renderPanel()
    await startTriage()

    const front = () => screen.getByTestId('knowledge-bit-focus-options-front').textContent

    expect(front()).toBe('Moment s1')

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(front()).toBe('Moment s2')

    fireEvent.keyDown(window, { key: 'ArrowUp' })

    expect(front()).toBe('Moment s1')
  })

  it('should move the highlight with Up/Down without leaving the list', async () => {
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })

    const checked = screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))

    expect(checked).toEqual(['false', 'true', 'false'])
  })

  it('should let a tap choose the sentence that Approve keeps', async () => {
    renderPanel()
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-option-s3'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-approve-p1'))

    await waitFor(() => expect(mockedKeep).toHaveBeenCalledWith({ data: { bitId: 'p1', keepVariantIds: ['s3'] } }))
  })

  it('should reject the phrase on X whatever sentence is highlighted', async () => {
    renderPanel()
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'x' })

    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'p1' } }))
    expect(mockedKeep).not.toHaveBeenCalled()
  })

  it('should leave arrow keys to normal scrolling and approve plainly on an ordinary card', async () => {
    renderPanel()
    await startTriage()
    fireEvent.keyDown(window, { key: 'x' })
    await screen.findByTestId('knowledge-bit-focus-approve-b2')

    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(true)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b2' } }))
    expect(mockedKeep).not.toHaveBeenCalled()
  })
})
