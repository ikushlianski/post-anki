// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({
  getChatQueue: vi.fn(),
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
  returnFromChatQueue: vi.fn(),
  approveFromChatQueue: vi.fn(),
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
  exportChatQueueMarkdown: vi.fn(),
}))

import {
  approveFromChatQueue,
  getChatQueueThread,
  returnFromChatQueue,
  sendChatQueueMessage,
  snoozeChatQueueCard,
} from './chat-queue.api'
import { ChatQueueThread } from './chat-queue-thread'

const KEY = 'chat-queue-draft:a'

const bit: ChatQueueKnowledgeBit = {
  id: 'a',
  body: 'Fact a',
  background: null,
  origin: 'extracted',
  subjectName: null,
  chatAt: '2026-10-28T10:00:00.000Z',
  turnsLeft: 8,
  snoozedUntil: null,
}

function renderThread(item: ChatQueueKnowledgeBit = bit) {
  return render(
    <ChatQueueThread item={item} onBack={vi.fn()} onResolved={vi.fn()} onSnoozeChanged={vi.fn()} />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(getChatQueueThread).mockResolvedValue({
    ok: true,
    data: {
      messages: [
        { seq: 1, role: 'user', text: 'question' },
        { seq: 2, role: 'assistant', text: 'the answer' },
      ],
      turnsLeft: 8,
      capReached: false,
    },
  } as never)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('copy button on tutor replies', () => {
  it('should copy a reply, show Copied, then go back to Copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderThread()

    const button = await screen.findByRole('button', { name: 'Copy reply' })

    expect(screen.getAllByRole('button', { name: 'Copy reply' })).toHaveLength(1)

    await userEvent.click(button)

    expect(writeText).toHaveBeenCalledWith('the answer')
    await waitFor(() => expect(button.textContent).toBe('Copied'))
    await waitFor(() => expect(button.textContent).toBe('Copy'), { timeout: 3500 })
  })

  it('should say Copy failed quietly when copying is not possible', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn().mockReturnValue(false)
    renderThread()

    await userEvent.click(await screen.findByRole('button', { name: 'Copy reply' }))

    expect(await screen.findByText('Copy failed')).toBeTruthy()
  })
})

describe('unsent message draft', () => {
  it('should restore the draft saved for this card when the thread opens', async () => {
    window.localStorage.setItem(KEY, 'half typed')
    renderThread()

    const field = await screen.findByLabelText<HTMLTextAreaElement>('Ask about this card')

    expect(field.value).toBe('half typed')
  })

  it('should save the draft after the user pauses typing', async () => {
    renderThread()
    await userEvent.type(await screen.findByLabelText('Ask about this card'), 'abc')

    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBe('abc'))
  })

  it('should clear the draft once the message is sent', async () => {
    window.localStorage.setItem(KEY, 'question 2')
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      data: { reply: 'r', replySeq: 2, turnsLeft: 7, capReached: false },
    } as never)
    renderThread()

    await screen.findByDisplayValue('question 2')
    await userEvent.click(screen.getByTestId('chat-queue-send'))

    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull())
  })

  it('should clear the draft when the card is resolved', async () => {
    window.localStorage.setItem(KEY, 'leftover')
    vi.mocked(approveFromChatQueue).mockResolvedValue({ ok: true, data: {} } as never)
    renderThread()

    await screen.findByDisplayValue('leftover')
    await userEvent.click(screen.getByTestId('chat-queue-accept'))

    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull())
  })

  it('should clear the draft when the card is snoozed', async () => {
    window.localStorage.setItem(KEY, 'leftover')
    vi.mocked(snoozeChatQueueCard).mockResolvedValue({
      ok: true,
      data: { snoozedUntil: '2026-11-01T00:00:00.000Z' },
    } as never)
    renderThread()

    await screen.findByDisplayValue('leftover')
    await userEvent.selectOptions(screen.getByTestId('chat-queue-snooze-a'), '1')

    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull())
  })
})

describe('review chat thread', () => {
  const reviewBit: ChatQueueKnowledgeBit = { ...bit, reviewChat: true }

  it('should offer only Clear chat as the way out of a review chat', async () => {
    renderThread(reviewBit)

    await screen.findByTestId('chat-queue-clear')

    expect(screen.queryByTestId('chat-queue-accept')).toBeNull()
    expect(screen.queryByTestId('chat-queue-reject')).toBeNull()
    expect(screen.queryByTestId('chat-queue-back')).toBeNull()
    expect(screen.queryByTestId('chat-queue-snooze-a')).toBeNull()
    expect(screen.getByLabelText('Ask about this card')).toBeTruthy()
  })

  it('should clear the thread and leave it when Clear chat is clicked', async () => {
    const onResolved = vi.fn()

    vi.mocked(returnFromChatQueue).mockResolvedValue({ ok: true, data: {} } as never)
    render(
      <ChatQueueThread
        item={reviewBit}
        onBack={vi.fn()}
        onResolved={onResolved}
        onSnoozeChanged={vi.fn()}
      />,
    )

    await userEvent.click(await screen.findByTestId('chat-queue-clear'))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('a'))
    expect(returnFromChatQueue).toHaveBeenCalledWith({ data: { bitId: 'a' } })
  })

  it('should keep the normal buttons for a triage chat', async () => {
    renderThread()

    await screen.findByTestId('chat-queue-accept')

    expect(screen.queryByTestId('chat-queue-clear')).toBeNull()
  })
})

describe('source link in the thread header', () => {
  it('should link the source title to the article when the card has one', async () => {
    renderThread({ ...bit, sourceTitle: 'Rust ownership', sourceUrl: 'https://example.com/rust' })

    const link = await screen.findByRole('link', { name: 'Rust ownership' })

    expect(link.getAttribute('href')).toBe('https://example.com/rust')
  })

  it('should show nothing for the source when the card has none', async () => {
    renderThread()

    await screen.findByTestId('chat-queue-thread')

    expect(screen.queryByTestId('chat-queue-thread-source')).toBeNull()
  })

  it('should render the source title as plain text when the url is not http or https', async () => {
    renderThread({ ...bit, sourceTitle: 'Sneaky', sourceUrl: 'javascript:alert(1)' })

    await screen.findByTestId('chat-queue-thread-source')

    expect(screen.queryByRole('link', { name: 'Sneaky' })).toBeNull()
    expect(screen.getByTestId('chat-queue-thread-source').textContent).toContain('Sneaky')
  })
})
