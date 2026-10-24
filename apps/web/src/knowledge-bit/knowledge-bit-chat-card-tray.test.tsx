// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import {
  askKnowledgeBitChat,
  createKnowledgeItemFromChat,
  draftKnowledgeBitChat,
} from './knowledge-bit-chat.api'

vi.mock('./knowledge-bit-chat.api', () => ({
  askKnowledgeBitChat: vi.fn(),
  draftKnowledgeBitChat: vi.fn(),
  createKnowledgeItemFromChat: vi.fn(),
}))

vi.mock('./knowledge-bit-review-events', () => ({
  notifyPendingReviewChanged: vi.fn(),
}))

const mockedAsk = vi.mocked(askKnowledgeBitChat)
const mockedDraft = vi.mocked(draftKnowledgeBitChat)
const mockedCreate = vi.mocked(createKnowledgeItemFromChat)

const createdItem: PendingKnowledgeBitForReview = {
  id: 'kb-new',
  body: 'Q\nA',
  background: null,
  variants: [],
  feedback: null,
  origin: 'manual',
  isAiGenerated: false,
  sourceLinks: [],
}

const REPLY = 'A semaphore counts permits.'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openChatWithReply() {
  const user = userEvent.setup()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  mockedAsk.mockResolvedValue({ reply: REPLY })
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeBitChatPanel knowledgeBitId="bit-1" />
    </QueryClientProvider>,
  )
  await user.click(screen.getByTestId('knowledge-bit-chat-open'))
  await user.type(screen.getByTestId('knowledge-bit-chat-input'), 'what is a semaphore')
  await user.click(screen.getByTestId('knowledge-bit-chat-send'))

  const reply = await screen.findByText(REPLY)

  return { user, reply }
}

function selectText(node: HTMLElement, text = REPLY) {
  const textNode = node.firstChild as Text
  const start = textNode.data.indexOf(text)
  const range = document.createRange()

  range.setStart(textNode, start)
  range.setEnd(textNode, start + text.length)

  const selection = window.getSelection()

  selection?.removeAllRanges()
  selection?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

describe('KnowledgeBitChatPanel highlight actions and card tray', () => {
  it('should fill the tray front when the learner selects text and taps Use as front', async () => {
    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-use-as-front'))

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-front') as HTMLTextAreaElement).value,
    ).toBe(REPLY)
    expect(screen.getByTestId('knowledge-bit-chat-tray-toggle').textContent).toContain('1 of 3')
  })

  it('should not offer highlight actions when nothing is selected', async () => {
    await openChatWithReply()

    expect(screen.queryByTestId('knowledge-bit-chat-highlight-bar')).toBeNull()
  })

  it('should save the tray values as a card that is not AI labelled', async () => {
    mockedCreate.mockResolvedValue(createdItem)

    const { user, reply } = await openChatWithReply()

    selectText(reply, 'A semaphore')
    await user.click(await screen.findByTestId('knowledge-bit-chat-use-as-front'))
    selectText(reply, 'counts permits.')
    await user.click(await screen.findByTestId('knowledge-bit-chat-use-as-back'))
    await user.type(screen.getByTestId('knowledge-bit-chat-tray-example'), 'a parking lot')
    await user.click(screen.getByTestId('knowledge-bit-chat-tray-create'))

    expect(await screen.findByText('Saved, waiting in review')).toBeTruthy()
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        knowledgeBitId: 'bit-1',
        front: 'A semaphore',
        back: 'counts permits.',
        example: 'a parking lot',
        aiGenerated: false,
        sourceLinks: [],
      },
    })
  })

  it('should empty the tray when the learner taps Clear', async () => {
    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-use-as-back'))
    await user.click(screen.getByTestId('knowledge-bit-chat-tray-clear'))

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-back') as HTMLTextAreaElement).value,
    ).toBe('')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('should copy the selection as the back first and fill the front from the model for Make fact', async () => {
    mockedDraft.mockResolvedValue({
      sources: [],
      card: { front: 'What does a semaphore count?', back: 'x', sources: [], usedWebSearch: false },
    })

    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-back') as HTMLTextAreaElement).value,
    ).toBe(REPLY)
    expect(
      await screen.findByDisplayValue('What does a semaphore count?'),
    ).toBeTruthy()
    expect(mockedDraft).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'create',
        allowWebSearch: false,
        instruction: expect.stringContaining(REPLY),
      }),
    })
  })

  it('should ignore a Make fact reply that arrives after the learner cleared the tray', async () => {
    let resolveDraft: (value: Awaited<ReturnType<typeof draftKnowledgeBitChat>>) => void = () => {}

    mockedDraft.mockReturnValue(new Promise((resolve) => { resolveDraft = resolve }))

    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))
    await user.click(screen.getByTestId('knowledge-bit-chat-tray-clear'))
    await act(async () => {
      resolveDraft({
        sources: [],
        card: { front: 'Late question?', back: 'x', sources: [], usedWebSearch: false },
      })
    })

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-front') as HTMLTextAreaElement).value,
    ).toBe('')
  })

  it('should keep only the newest Make fact reply when an older one arrives late', async () => {
    const resolvers: Array<(value: Awaited<ReturnType<typeof draftKnowledgeBitChat>>) => void> = []

    mockedDraft.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve) }),
    )

    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))
    await user.click(screen.getByTestId('knowledge-bit-chat-tray-clear'))
    selectText(reply, 'A semaphore')
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))

    const card = (front: string) => ({
      sources: [],
      card: { front, back: 'x', sources: [], usedWebSearch: false },
    })

    await act(async () => {
      resolvers[1](card('Newest question?'))
    })
    await act(async () => {
      resolvers[0](card('Older question?'))
    })

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-front') as HTMLTextAreaElement).value,
    ).toBe('Newest question?')
  })

  it('should keep the front the learner already typed when the model returns an empty front', async () => {
    mockedDraft.mockResolvedValue({
      sources: [],
      card: { front: '', back: 'x', sources: [], usedWebSearch: false },
    })

    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-use-as-front'))
    await user.clear(screen.getByTestId('knowledge-bit-chat-tray-front'))
    await user.type(screen.getByTestId('knowledge-bit-chat-tray-front'), 'My own question')
    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))
    await vi.waitFor(() => expect(mockedDraft).toHaveBeenCalled())

    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-front') as HTMLTextAreaElement).value,
    ).toBe('My own question')
  })

  it('should show the alert and keep the copied back when Make fact fails', async () => {
    mockedDraft.mockRejectedValue(new Error('boom'))

    const { user, reply } = await openChatWithReply()

    selectText(reply)
    await user.click(await screen.findByTestId('knowledge-bit-chat-make-fact'))

    expect((await screen.findByRole('alert')).textContent).toContain('Could not write a front')
    expect(
      (screen.getByTestId('knowledge-bit-chat-tray-back') as HTMLTextAreaElement).value,
    ).toBe(REPLY)
  })
})
