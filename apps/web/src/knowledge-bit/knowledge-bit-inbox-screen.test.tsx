// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import {
  discardKnowledgeBitFromInboxForReview,
  generateKnowledgeBitExampleForReview,
  getInboxKnowledgeBits,
  returnKnowledgeBitFromInboxForReview,
} from './knowledge-bit-inbox.api'
import { moveKnowledgeBitToChatQueueForReview } from './knowledge-bit-chat-move.api'
import { editKnowledgeBitForReview, editKnowledgeBitNoteForReview } from './knowledge-bit-review.api'
import { PENDING_REVIEW_CHANGED_EVENT } from './knowledge-bit-review-events'
import { KnowledgeBitInboxScreen } from './knowledge-bit-inbox-screen'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('./knowledge-bit-inbox.api', () => ({
  getInboxKnowledgeBits: vi.fn(),
  returnKnowledgeBitFromInboxForReview: vi.fn(),
  discardKnowledgeBitFromInboxForReview: vi.fn(),
  generateKnowledgeBitExampleForReview: vi.fn(),
}))

vi.mock('./knowledge-bit-chat-move.api', () => ({ moveKnowledgeBitToChatQueueForReview: vi.fn() }))

vi.mock('./knowledge-bit-review.api', () => ({
  editKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitNoteForReview: vi.fn(),
}))

vi.mock('./knowledge-bit-chat-panel', () => ({
  KnowledgeBitChatPanel: ({ knowledgeBitId }: { knowledgeBitId: string }) => (
    <button type="button" data-testid={`chat-${knowledgeBitId}`}>
      Chat about this
    </button>
  ),
}))

function item(id: string, overrides: Partial<InboxKnowledgeBit> = {}): InboxKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    exampleAiGeneratedAt: null,
    origin: 'extracted',
    subjectName: null,
    cardCount: 2,
    inboxAt: '2026-10-28T10:00:00.000Z',
    note: null,
    ...overrides,
  }
}

function list(items: InboxKnowledgeBit[]) {
  return { items, count: items.length }
}

beforeEach(() => {
  ;[
    getInboxKnowledgeBits,
    returnKnowledgeBitFromInboxForReview,
    discardKnowledgeBitFromInboxForReview,
    generateKnowledgeBitExampleForReview,
    editKnowledgeBitForReview,
    editKnowledgeBitNoteForReview,
    moveKnowledgeBitToChatQueueForReview,
  ].forEach((fn) => vi.mocked(fn).mockReset())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('KnowledgeBitInboxScreen', () => {
  it('should list the items in the order the server sent them with subject and card count', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(
      list([item('b2', { subjectName: 'Physics' }), item('b1')]),
    )
    render(<KnowledgeBitInboxScreen />)

    await screen.findByTestId('knowledge-bit-inbox-row-b2')

    const rows = screen.getAllByRole('listitem')

    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'knowledge-bit-inbox-row-b2',
      'knowledge-bit-inbox-row-b1',
    ])
    expect(rows[0]!.textContent).toContain('Physics · 2 cards')
    expect(rows[1]!.textContent).toContain('No subject')
  })

  it('should announce the loading state to screen readers', () => {
    vi.mocked(getInboxKnowledgeBits).mockReturnValue(new Promise(() => {}))
    render(<KnowledgeBitInboxScreen />)

    expect(screen.getByTestId('knowledge-bit-inbox-loading').getAttribute('role')).toBe('status')
  })

  it('should say how many cards exist when only the first part of the Inbox is shown', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue({ ...list([item('b1')]), total: 230, hasMore: true })
    render(<KnowledgeBitInboxScreen />)

    const notice = await screen.findByTestId('knowledge-bit-inbox-truncated')

    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.textContent).toBe('Showing the first 1 of 230 cards')
  })

  it('should lower the Inbox notice counts after a card leaves', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue({ ...list([item('b1'), item('b2')]), total: 230, hasMore: true })
    vi.mocked(discardKnowledgeBitFromInboxForReview).mockResolvedValue({ ok: true })
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-discard-b1-button'))
    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-discard-b1-confirm'))

    await waitFor(() =>
      expect(screen.getByTestId('knowledge-bit-inbox-truncated').textContent).toBe('Showing the first 1 of 229 cards'),
    )
  })

  it('should not show a truncation notice when the whole Inbox is listed', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)

    await screen.findByTestId('knowledge-bit-inbox-row-b1')

    expect(screen.queryByTestId('knowledge-bit-inbox-truncated')).toBeNull()
  })

  it('should explain how items arrive and link to triage when nothing is set aside', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([]))
    render(<KnowledgeBitInboxScreen />)

    expect((await screen.findByTestId('knowledge-bit-inbox-empty')).textContent).toContain('"Set aside"')
    expect(screen.getByRole('link', { name: 'triaging suggested cards' }).getAttribute('href')).toBe('/knowledge-bit-review')
  })

  it('should offer the item chat panel on each row', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)

    expect(await screen.findByTestId('chat-b1')).toBeTruthy()
  })

  it('should keep the chat panel outside the row of action buttons', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)

    const chat = await screen.findByTestId('chat-b1')
    const actionsRow = screen.getByTestId('knowledge-bit-inbox-back-b1').parentElement

    expect(actionsRow?.contains(chat)).toBe(false)
  })

  it('should show an error with retry when the list fails to load', async () => {
    vi.mocked(getInboxKnowledgeBits).mockRejectedValueOnce(new Error('network'))
    vi.mocked(getInboxKnowledgeBits).mockResolvedValueOnce(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('knowledge-bit-inbox-row-b1')).toBeTruthy()
  })

  it('should remove the row and refresh the counts when sent back to triage', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    vi.mocked(returnKnowledgeBitFromInboxForReview).mockResolvedValue({ ok: true })
    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-back-b1'))

    await waitFor(() => expect(screen.queryByTestId('knowledge-bit-inbox-row-b1')).toBeNull())
    expect(returnKnowledgeBitFromInboxForReview).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(changed).toHaveBeenCalled()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should keep the row and show a message when sending back fails', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    vi.mocked(returnKnowledgeBitFromInboxForReview).mockRejectedValue(new Error('network'))
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-back-b1'))

    expect(await screen.findByText("Couldn't send back to triage. Try again.")).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-inbox-row-b1')).toBeTruthy()
  })

  it('should move an item to Chat and drop its row from the Inbox', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1'), item('b2')]))
    vi.mocked(moveKnowledgeBitToChatQueueForReview).mockResolvedValue({ ok: true } as never)
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-chat-b1'))

    await waitFor(() => expect(screen.queryByTestId('knowledge-bit-inbox-row-b1')).toBeNull())
    expect(moveKnowledgeBitToChatQueueForReview).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(screen.getByTestId('knowledge-bit-inbox-row-b2')).toBeTruthy()
  })

  it('should keep the row and show an error under it when sending to Chat fails', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    vi.mocked(moveKnowledgeBitToChatQueueForReview).mockRejectedValue(new Error('x'))
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-chat-b1'))

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't send to Chat. Try again.")
    expect(screen.getByTestId('knowledge-bit-inbox-row-b1')).toBeTruthy()
  })

  it('should keep the row when the learner cancels the inline discard confirmation', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-discard-b1-button'))
    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-discard-b1-cancel'))

    expect(discardKnowledgeBitFromInboxForReview).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-inbox-row-b1')).toBeTruthy()
  })

  it('should remove the row after the discard is confirmed', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    vi.mocked(discardKnowledgeBitFromInboxForReview).mockResolvedValue({ ok: true })
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-discard-b1-button'))
    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-discard-b1-confirm'))

    await waitFor(() => expect(screen.queryByTestId('knowledge-bit-inbox-row-b1')).toBeNull())
    expect(discardKnowledgeBitFromInboxForReview).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
  })

  it('should add an AI example to an Inbox row and undo it back to the earlier text', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1', { background: null })]))
    vi.mocked(generateKnowledgeBitExampleForReview).mockResolvedValue({
      ok: true,
      data: {
        knowledgeBitId: 'b1',
        example: 'A kettle.',
        exampleAiGeneratedAt: '2026-10-28T11:00:00.000Z',
        previousExample: null,
        generationsLeft: 4,
      },
    })
    vi.mocked(editKnowledgeBitForReview).mockResolvedValue({ ok: true })
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-example-button-b1'))

    expect((await screen.findByTestId('knowledge-bit-inbox-example-b1')).textContent).toContain('A kettle.')

    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-example-undo-b1'))

    await waitFor(() => expect(screen.queryByTestId('knowledge-bit-inbox-example-b1')).toBeNull())
    expect(editKnowledgeBitForReview).toHaveBeenCalledWith({
      data: { bitId: 'b1', body: 'Fact b1', background: null },
    })
  })
  it('should not offer Edit on an item that is not a cloze or list note', async () => {
    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1')]))
    render(<KnowledgeBitInboxScreen />)

    await screen.findByTestId('knowledge-bit-inbox-row-b1')

    expect(screen.queryByTestId('knowledge-bit-inbox-edit-b1')).toBeNull()
  })

  it('should save an edited cloze note from the row and show the new text and card count', async () => {
    const note = { variantId: 'v1', mode: 'cloze' as const, text: 'A {{c1::cat}} sat.' }

    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(
      list([item('b1', { body: 'A cat sat.', note, cardCount: 1 })]),
    )
    vi.mocked(editKnowledgeBitNoteForReview).mockResolvedValue({
      ok: true,
      variantId: 'v2',
      cards: [
        { id: 'v2', order: 0, prompt: 'A [...] sat. [dog]', answer: 'cat' },
        { id: 'v3', order: 1, prompt: 'A cat [...]', answer: 'sat' },
      ],
    })
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-edit-b1'))
    fireEvent.change(screen.getByTestId('anki-review-note-editor-text'), {
      target: { value: 'A {{c1::dog}} {{c2::sat}}.' },
    })
    fireEvent.click(screen.getByTestId('anki-review-editor-save'))

    await waitFor(() =>
      expect(screen.getByTestId('knowledge-bit-inbox-body-b1').textContent).toBe('A dog sat.'),
    )
    expect(editKnowledgeBitNoteForReview).toHaveBeenCalledWith({
      data: { variantId: 'v1', text: 'A {{c1::dog}} {{c2::sat}}.', mode: 'cloze' },
    })
    expect(screen.getByTestId('knowledge-bit-inbox-row-b1').textContent).toContain('2 cards')
  })

  it('should keep the editor open with a message when saving the note fails', async () => {
    const note = { variantId: 'v1', mode: 'cloze' as const, text: 'A {{c1::cat}} sat.' }

    vi.mocked(getInboxKnowledgeBits).mockResolvedValue(list([item('b1', { note })]))
    vi.mocked(editKnowledgeBitNoteForReview).mockRejectedValue(new Error('network'))
    render(<KnowledgeBitInboxScreen />)
    fireEvent.click(await screen.findByTestId('knowledge-bit-inbox-edit-b1'))
    fireEvent.click(screen.getByTestId('anki-review-editor-save'))

    expect(await screen.findByText("Couldn't save your changes. Try again.")).toBeTruthy()
    expect(screen.getByTestId('anki-review-note-editor')).toBeTruthy()
  })
})
