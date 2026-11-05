// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { startTriageSession } from '../card-triage/card-triage.api'
import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import { moveKnowledgeBitToChatQueueForReview } from './knowledge-bit-chat-move.api'
import { approveKnowledgeBitForReview } from './knowledge-bit-review.api'
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

vi.mock('./knowledge-bit-inbox.api', () => ({
  moveKnowledgeBitToInboxForReview: vi.fn(),
  returnKnowledgeBitFromInboxForReview: vi.fn(),
  generateKnowledgeBitExampleForReview: vi.fn(),
}))

vi.mock('./knowledge-bit-chat-move.api', () => ({
  moveKnowledgeBitToChatQueueForReview: vi.fn(),
  returnKnowledgeBitFromChatQueueForReview: vi.fn(),
}))

vi.mock('../card-triage/card-triage.api', () => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
  discardTriageSession: vi.fn(),
  putTriageDecision: vi.fn(),
  deleteTriageDecision: vi.fn(),
  listTriageDecisions: vi.fn(),
}))

const mockedChat = vi.mocked(moveKnowledgeBitToChatQueueForReview)
const mockedApprove = vi.mocked(approveKnowledgeBitForReview)

const TWO_CARDS: PendingKnowledgeSourceForReview[] = [
  makeSource('src-1', [makeBit('b1'), makeBit('b2')]),
]

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches }))
}

describe('Triage card leaving to Chat', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedChat.mockReset()
    mockedApprove.mockReset()
    vi.mocked(startTriageSession).mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
    mockedChat.mockResolvedValue({ ok: true, chatCount: 1 })
    stubReducedMotion(false)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('should keep the card on screen marked as leaving to Chat while the API call is already sent, then show the next card', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })

    expect(screen.getByTestId('knowledge-bit-focus-card-b1').getAttribute('data-leaving')).toBe('chat')
    await waitFor(() => expect(mockedChat).toHaveBeenCalledWith({ data: { bitId: 'b1' } }))
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    expect(screen.getByTestId('knowledge-bit-focus-card-b2').getAttribute('data-leaving')).toBeNull()
  })

  it('should ignore a second action while the card is leaving so the next card is not acted on', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })
    fireEvent.keyDown(window, { key: 'c' })
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    expect(mockedChat).toHaveBeenCalledTimes(1)
    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should skip the animation and advance immediately when the user prefers reduced motion', async () => {
    stubReducedMotion(true)
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })

    expect(screen.getByTestId('knowledge-bit-focus-card-b1').getAttribute('data-leaving')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
  })

  it('should bring the card back and not skip it when the Chat call fails', async () => {
    mockedChat.mockRejectedValue(new Error('network'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })
    await waitFor(() => expect(mockedChat).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-card-b1').getAttribute('data-leaving')).toBeNull())
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
  })
})
