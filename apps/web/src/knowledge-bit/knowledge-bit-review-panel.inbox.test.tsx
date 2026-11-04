// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { putTriageDecision, startTriageSession } from '../card-triage/card-triage.api'
import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  editKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import {
  moveKnowledgeBitToChatQueueForReview,
  returnKnowledgeBitFromChatQueueForReview,
} from './knowledge-bit-chat-move.api'
import {
  generateKnowledgeBitExampleForReview,
  moveKnowledgeBitToInboxForReview,
  returnKnowledgeBitFromInboxForReview,
} from './knowledge-bit-inbox.api'
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

const mockedMove = vi.mocked(moveKnowledgeBitToInboxForReview)
const mockedReturn = vi.mocked(returnKnowledgeBitFromInboxForReview)
const mockedChat = vi.mocked(moveKnowledgeBitToChatQueueForReview)
const mockedChatReturn = vi.mocked(returnKnowledgeBitFromChatQueueForReview)
const mockedGenerate = vi.mocked(generateKnowledgeBitExampleForReview)
const mockedEdit = vi.mocked(editKnowledgeBitForReview)
const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedPut = vi.mocked(putTriageDecision)

const TWO_CARDS: PendingKnowledgeSourceForReview[] = [
  makeSource('src-1', [makeBit('b1'), makeBit('b2')]),
]

function example(text: string, previous: string | null = null, left = 4) {
  return {
    ok: true as const,
    data: {
      knowledgeBitId: 'b1',
      example: text,
      exampleAiGeneratedAt: '2026-10-28T10:00:00.000Z',
      previousExample: previous,
      generationsLeft: left,
    },
  }
}

describe('KnowledgeBitReviewPanel Inbox and AI example', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;[mockedMove, mockedReturn, mockedChat, mockedChatReturn, mockedGenerate, mockedEdit, mockedApprove, mockedPut].forEach((mock) =>
      mock.mockReset(),
    )
    vi.mocked(startTriageSession).mockResolvedValue({ ok: true, data: TRIAGE_SESSION })
    mockedMove.mockResolvedValue({ ok: true, inboxCount: 1 })
    mockedReturn.mockResolvedValue({ ok: true })
    mockedChat.mockResolvedValue({ ok: true, chatCount: 1 })
    mockedChatReturn.mockResolvedValue({ ok: true })
    mockedEdit.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should send the item to the Chat queue with C, advance, and leave the Inbox untouched', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    expect(mockedChat).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedApprove).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-review-announcer-polite').textContent).toBe('Moved to Chat, 1 left')
  })

  it('should send the item to the Chat queue from the Chat about this button and count it on the done screen', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[makeSource('src-1', [makeBit('b1')])]} />)
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-chat-b1'))

    expect((await screen.findByTestId('knowledge-bit-focus-done-chat')).textContent).toBe('1 sent to Chat')
    expect(screen.queryByTestId('knowledge-bit-focus-done-inbox')).toBeNull()
    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedPut).not.toHaveBeenCalled()
  })

  it('should take the item back out of the Chat queue when Z follows a Chat move', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    fireEvent.keyDown(window, { key: 'z' })

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1'))
    expect(mockedChatReturn).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(mockedReturn).not.toHaveBeenCalled()
  })

  it('should keep the card and show a plain message when the Chat move fails', async () => {
    mockedChat.mockRejectedValue(new Error('network'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'c' })

    expect(await screen.findByText("Couldn't send to Chat. Try again.")).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
  })

  it('should move the item to the Inbox with I, advance, announce, and neither approve nor reject', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'i' })

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    expect(mockedMove).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(mockedApprove).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-review-announcer-polite').textContent).toBe('Moved to Inbox, 1 left')
  })

  it('should keep the Inbox move out of the triage session record and say so on the done screen', async () => {
    render(<KnowledgeBitReviewPanel initialSources={[makeSource('src-1', [makeBit('b1')])]} />)
    await startTriage()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-inbox-b1'))

    expect((await screen.findByTestId('knowledge-bit-focus-done-inbox')).textContent).toBe('1 set aside')
    expect(mockedPut).not.toHaveBeenCalled()
  })

  it('should return the item to the front of the queue when Z follows an Inbox move', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'i' })
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))
    fireEvent.keyDown(window, { key: 'z' })

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1'))
    expect(mockedReturn).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(screen.getByTestId('knowledge-bit-focus-progress').textContent).toContain('2 to review')
  })

  it('should offer Undo and Open Set aside in a toast after the move', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'i' })
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-toast-undo'))

    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1'))
    expect(screen.queryByTestId('knowledge-bit-inbox-toast')).toBeNull()
  })

  it('should keep the card and show a plain message when the Inbox move fails', async () => {
    mockedMove.mockRejectedValue(new Error('network'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'i' })

    expect(await screen.findByText("Couldn't send to Inbox. Try again.")).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
  })

  it('should write an AI example with E, tag it as AI and stay on the same card', async () => {
    mockedGenerate.mockResolvedValue(example('A kettle at sea level.'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })

    const field = (await screen.findByTestId('knowledge-bit-review-edit-example-b1')) as HTMLTextAreaElement

    expect(field.value).toBe('A kettle at sea level.')
    expect(screen.getByTestId('knowledge-bit-focus-example-ai-tag-b1')).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1')
    expect(mockedGenerate).toHaveBeenCalledWith({ data: { bitId: 'b1', overwrite: false } })
    expect((screen.getByTestId('knowledge-bit-focus-approve-b1') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should remove the example when Z undoes the first AI example', async () => {
    mockedGenerate.mockResolvedValue(example('A kettle at sea level.'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })
    await screen.findByTestId('knowledge-bit-focus-example-ai-tag-b1')
    fireEvent.keyDown(window, { key: 'z' })

    await waitFor(() => expect(screen.queryByTestId('knowledge-bit-focus-example-ai-tag-b1')).toBeNull())
    expect(mockedEdit).toHaveBeenCalledWith({ data: { bitId: 'b1', body: 'Body b1', background: null } })
    expect(screen.getByTestId('knowledge-bit-focus-add-example')).toBeTruthy()
  })

  it('should restore the earlier example text when Z undoes a replaced AI example', async () => {
    mockedGenerate.mockResolvedValueOnce(example('First example.'))
    mockedGenerate.mockResolvedValueOnce(example('Second example.', 'First example.', 3))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })
    await screen.findByDisplayValue('First example.')
    fireEvent.keyDown(window, { key: 'e' })
    await screen.findByDisplayValue('Second example.')
    expect(screen.getByTestId('knowledge-bit-focus-example-b1').textContent).toContain('New AI example')

    fireEvent.keyDown(window, { key: 'z' })

    await screen.findByDisplayValue('First example.')
    expect(mockedEdit).toHaveBeenCalledWith({
      data: { bitId: 'b1', body: 'Body b1', background: 'First example.' },
    })
  })

  it('should undo an AI example and an Inbox move in reverse order', async () => {
    mockedGenerate.mockResolvedValue(example('A kettle.'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })
    await screen.findByDisplayValue('A kettle.')
    fireEvent.keyDown(window, { key: 'i' })
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b2'))

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(screen.getByTestId('knowledge-bit-focus-statement').textContent).toBe('Body b1'))
    expect(mockedEdit).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(mockedEdit).toHaveBeenCalledTimes(1))
  })

  it('should ask before replacing a human-written example and change nothing on cancel', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const bit = { ...makeBit('b1'), background: 'My own example' }
    render(<KnowledgeBitReviewPanel initialSources={[makeSource('src-1', [bit])]} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })

    expect(window.confirm).toHaveBeenCalled()
    expect(mockedGenerate).not.toHaveBeenCalled()
    expect((screen.getByTestId('knowledge-bit-review-edit-example-b1') as HTMLTextAreaElement).value).toBe(
      'My own example',
    )
  })

  it('should overwrite a human-written example after the learner confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedGenerate.mockResolvedValue(example('AI text', 'My own example'))
    const bit = { ...makeBit('b1'), background: 'My own example' }
    render(<KnowledgeBitReviewPanel initialSources={[makeSource('src-1', [bit])]} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })

    await screen.findByDisplayValue('AI text')
    expect(mockedGenerate).toHaveBeenCalledWith({ data: { bitId: 'b1', overwrite: true } })
  })

  it('should disable the button with an explanation after the limit is reached', async () => {
    mockedGenerate.mockResolvedValue({ ok: false, error: 'limit_reached' })
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })

    expect((await screen.findByTestId('knowledge-bit-focus-example-notice-b1')).textContent).toBe(
      '5 AI examples used for this item',
    )
    expect((screen.getByTestId('knowledge-bit-focus-example-b1') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should show a plain error for a failed example and let E retry', async () => {
    mockedGenerate.mockResolvedValueOnce({ ok: false, error: 'generation_failed' })
    mockedGenerate.mockResolvedValueOnce(example('Second try.'))
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })
    expect((await screen.findByTestId('knowledge-bit-focus-example-notice-b1')).textContent).toBe(
      "Couldn't write an example. Try again.",
    )

    fireEvent.keyDown(window, { key: 'e' })

    await screen.findByDisplayValue('Second try.')
    expect(screen.queryByTestId('knowledge-bit-focus-example-notice-b1')).toBeNull()
  })

  it('should say AI is paused when the daily budget is used up', async () => {
    mockedGenerate.mockResolvedValue({ ok: false, error: 'budget_exceeded' })
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'e' })

    expect((await screen.findByTestId('knowledge-bit-focus-example-notice-b1')).textContent).toBe(
      'AI is paused for today.',
    )
  })

  it('should not react to C, I or E typed into the note field', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(screen.getByTestId('knowledge-bit-focus-note'), { key: 'c' })
    fireEvent.keyDown(screen.getByTestId('knowledge-bit-focus-note'), { key: 'i' })
    fireEvent.keyDown(screen.getByTestId('knowledge-bit-focus-note'), { key: 'e' })

    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedChat).not.toHaveBeenCalled()
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('should not move on ArrowUp or ArrowDown so the card keeps scrolling', async () => {
    render(<KnowledgeBitReviewPanel initialSources={TWO_CARDS} />)
    await startTriage()

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedGenerate).not.toHaveBeenCalled()
  })
})
