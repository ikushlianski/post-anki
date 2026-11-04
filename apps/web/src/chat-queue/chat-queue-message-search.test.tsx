// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({ searchChatQueue: vi.fn() }))

import { searchChatQueue } from './chat-queue.api'
import { ChatQueueMessageSearch } from './chat-queue-message-search'
import { CHAT_QUEUE_SEARCH_DEBOUNCE_MS } from './use-chat-queue-search'

const items: ChatQueueKnowledgeBit[] = [
  {
    id: 'kb_1',
    body: 'Ownership in Rust',
    background: null,
    origin: 'extracted',
    subjectName: null,
    chatAt: '2026-10-28T10:00:00.000Z',
    turnsLeft: 8,
    snoozedUntil: null,
  },
]

async function type(value: string) {
  fireEvent.change(screen.getByTestId('chat-queue-message-search-input'), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHAT_QUEUE_SEARCH_DEBOUNCE_MS + 10)
  })
}

describe('ChatQueueMessageSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(searchChatQueue).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should not call the API until at least two characters are typed', async () => {
    render(<ChatQueueMessageSearch items={items} onOpen={vi.fn()} />)

    await type('a')

    expect(searchChatQueue).not.toHaveBeenCalled()
  })

  it('should show matching messages and open that card thread when one is clicked', async () => {
    vi.mocked(searchChatQueue).mockResolvedValue({
      ok: true,
      data: { results: [{ cardId: 'kb_1', seq: 2, role: 'assistant', snippet: 'a single owner' }] },
    })

    const onOpen = vi.fn()

    render(<ChatQueueMessageSearch items={items} onOpen={onOpen} />)
    await type('owner')

    expect(searchChatQueue).toHaveBeenCalledWith({ data: { q: 'owner' } })
    expect(screen.getByText('Ownership in Rust')).toBeTruthy()

    fireEvent.click(screen.getByTestId('chat-queue-message-hit-kb_1-2'))

    expect(onOpen).toHaveBeenCalledWith('kb_1')
  })

  it('should tell the learner to refine the search only when results were cut off', async () => {
    const results = [{ cardId: 'kb_1', seq: 2, role: 'assistant' as const, snippet: 'a single owner' }]

    vi.mocked(searchChatQueue).mockResolvedValue({ ok: true, data: { results, hasMore: true } })
    render(<ChatQueueMessageSearch items={items} onOpen={vi.fn()} />)
    await type('owner')

    expect(screen.getByTestId('chat-queue-message-search-more').textContent).toBe(
      'Showing the first 1, refine your search',
    )

    vi.mocked(searchChatQueue).mockResolvedValue({ ok: true, data: { results } })
    await type('owners')

    expect(screen.queryByTestId('chat-queue-message-search-more')).toBeNull()
  })

  it('should say so when no conversation matches', async () => {
    vi.mocked(searchChatQueue).mockResolvedValue({ ok: true, data: { results: [] } })
    render(<ChatQueueMessageSearch items={items} onOpen={vi.fn()} />)
    await type('nothing')

    expect(screen.getByTestId('chat-queue-message-search-empty')).toBeTruthy()
  })

  it('should show an error instead of stale results when the search fails', async () => {
    vi.mocked(searchChatQueue).mockResolvedValue({ ok: false, failure: 'other' })
    render(<ChatQueueMessageSearch items={items} onOpen={vi.fn()} />)
    await type('owner')

    expect(screen.getByTestId('chat-queue-message-search-error')).toBeTruthy()
  })
})
