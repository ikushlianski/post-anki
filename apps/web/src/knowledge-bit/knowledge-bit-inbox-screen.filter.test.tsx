// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import {
  discardKnowledgeBitFromInboxForReview,
  getInboxKnowledgeBits,
  returnKnowledgeBitFromInboxForReview,
} from './knowledge-bit-inbox.api'
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

vi.mock('./knowledge-bit-review.api', () => ({
  editKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitNoteForReview: vi.fn(),
}))

vi.mock('./knowledge-bit-chat-panel', () => ({
  KnowledgeBitChatPanel: () => null,
}))

function item(id: string, overrides: Partial<InboxKnowledgeBit> = {}): InboxKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    exampleAiGeneratedAt: null,
    origin: 'extracted',
    subjectName: null,
    cardCount: 1,
    inboxAt: '2026-10-28T10:00:00.000Z',
    note: null,
    ...overrides,
  }
}

const items = [
  item('a', { body: 'Closures capture scope', subjectName: 'JavaScript' }),
  item('b', { body: 'Index scans', subjectName: 'Postgres' }),
  item('c', { body: 'Vacuum frees space', subjectName: 'Postgres' }),
]

function rowIds() {
  return screen.queryAllByRole('listitem').map((row) => row.getAttribute('data-testid'))
}

async function renderScreen() {
  vi.mocked(getInboxKnowledgeBits).mockResolvedValue({ items, count: items.length })
  render(<KnowledgeBitInboxScreen />)
  await screen.findByTestId('knowledge-bit-inbox-row-a')
}

beforeEach(() => {
  vi.mocked(getInboxKnowledgeBits).mockReset()
  vi.mocked(returnKnowledgeBitFromInboxForReview).mockReset()
  vi.mocked(discardKnowledgeBitFromInboxForReview).mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('KnowledgeBitInboxScreen filters', () => {
  it('should offer only subjects present in the Inbox', async () => {
    await renderScreen()

    const options = Array.from(
      (screen.getByTestId('knowledge-bit-inbox-subject') as HTMLSelectElement).options,
    ).map((option) => option.value)

    expect(options).toEqual(['', 'JavaScript', 'Postgres'])
  })

  it('should narrow the list by body text after the debounce, ignoring case', async () => {
    await renderScreen()
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-search'), { target: { value: 'CLOSURES' } })

    await waitFor(() => expect(rowIds()).toEqual(['knowledge-bit-inbox-row-a']))
    expect(screen.getByTestId('knowledge-bit-inbox-count').textContent).toBe('1 of 3')
  })

  it('should match the subject name in search', async () => {
    await renderScreen()
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-search'), { target: { value: 'postgres' } })

    await waitFor(() => expect(rowIds()).toHaveLength(2))
  })

  it('should compose the subject filter with search', async () => {
    await renderScreen()
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-subject'), { target: { value: 'Postgres' } })
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-search'), { target: { value: 'vacuum' } })

    await waitFor(() => expect(rowIds()).toEqual(['knowledge-bit-inbox-row-c']))
  })

  it('should announce the result count politely', async () => {
    await renderScreen()

    expect(screen.getByTestId('knowledge-bit-inbox-count').getAttribute('aria-live')).toBe('polite')
  })

  it('should show an empty-result state and restore the list on clear', async () => {
    await renderScreen()
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-search'), { target: { value: 'zzz' } })

    await screen.findByTestId('knowledge-bit-inbox-no-matches')
    expect(rowIds()).toEqual([])

    fireEvent.click(screen.getAllByText('Clear filters')[0]!)

    await waitFor(() => expect(rowIds()).toHaveLength(3))
    expect((screen.getByTestId('knowledge-bit-inbox-search') as HTMLInputElement).value).toBe('')
  })

  it('should clear a selected subject once its last item leaves the Inbox', async () => {
    vi.mocked(discardKnowledgeBitFromInboxForReview).mockResolvedValue({ ok: true } as never)
    await renderScreen()
    fireEvent.change(screen.getByTestId('knowledge-bit-inbox-subject'), { target: { value: 'JavaScript' } })
    await waitFor(() => expect(rowIds()).toEqual(['knowledge-bit-inbox-row-a']))

    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-discard-a-button'))
    fireEvent.click(screen.getByTestId('knowledge-bit-inbox-discard-a-confirm'))

    await waitFor(() => expect(rowIds()).toHaveLength(2))
    expect((screen.getByTestId('knowledge-bit-inbox-subject') as HTMLSelectElement).value).toBe('')
  })
})
