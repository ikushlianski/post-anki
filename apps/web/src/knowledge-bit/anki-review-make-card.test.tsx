// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { AnkiReviewCard } from './anki-review-card'
import { createKnowledgeItemFromChat } from './knowledge-bit-chat.api'

vi.mock('./knowledge-bit-chat-panel', () => ({ KnowledgeBitChatPanel: () => null }))
vi.mock('./knowledge-bit-chat.api', () => ({ createKnowledgeItemFromChat: vi.fn() }))

const card: ReviewCard = {
  variantId: 'v1',
  knowledgeBitId: 'kb1',
  kind: 'basic',
  prompt: 'What is a closure?',
  answer: 'A function that remembers its scope. It keeps outer variables alive.',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'review',
  leech: false,
  intervalPreview: { again: 1, hard: 2, good: 3, easy: 4 },
}

function selectText(text: string) {
  const node = screen.getByTestId('anki-review-answer').firstChild as Text
  const range = document.createRange()
  const start = node.data.indexOf(text)

  range.setStart(node, start)
  range.setEnd(node, start + text.length)

  const selection = document.getSelection()

  selection?.removeAllRanges()
  selection?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

function setOnline(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value)
}

beforeEach(() => {
  setOnline(true)
  vi.mocked(createKnowledgeItemFromChat).mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderCard(onReveal = vi.fn()) {
  render(<AnkiReviewCard card={card} revealed={true} onReveal={onReveal} />)

  return onReveal
}

describe('AnkiReviewMakeCard', () => {
  it('should offer Make card only after text in the answer is selected', () => {
    renderCard()

    expect(screen.queryByTestId('make-card-button')).toBeNull()

    selectText('A function that remembers its scope.')

    expect(screen.getByTestId('make-card-button')).toBeTruthy()
  })

  it('should prefill the answer with the selection and show the current question as a hint', () => {
    renderCard()
    selectText('It keeps outer variables alive.')
    fireEvent.click(screen.getByTestId('make-card-button'))

    expect((screen.getByTestId('make-card-back') as HTMLTextAreaElement).value).toBe('It keeps outer variables alive.')
    expect((screen.getByTestId('make-card-front') as HTMLTextAreaElement).value).toBe('')
    expect(screen.getByTestId('make-card-front').getAttribute('placeholder')).toBe('What is a closure?')
  })

  it('should create the card under the current card and confirm without grading', async () => {
    vi.mocked(createKnowledgeItemFromChat).mockResolvedValue({} as Awaited<ReturnType<typeof createKnowledgeItemFromChat>>)
    const onReveal = renderCard()

    selectText('It keeps outer variables alive.')
    fireEvent.click(screen.getByTestId('make-card-button'))
    fireEvent.change(screen.getByTestId('make-card-front'), { target: { value: 'What does a closure keep alive?' } })
    fireEvent.click(screen.getByTestId('make-card-create'))

    await waitFor(() => expect(screen.getByTestId('make-card-created').textContent).toBe('Card created'))
    expect(createKnowledgeItemFromChat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createKnowledgeItemFromChat).mock.calls[0]?.[0]).toEqual({
      data: {
        knowledgeBitId: 'kb1',
        front: 'What does a closure keep alive?',
        back: 'It keeps outer variables alive.',
        aiGenerated: false,
        sourceLinks: [],
      },
    })
    expect(onReveal).not.toHaveBeenCalled()
    expect(screen.queryByTestId('make-card-sheet')).toBeNull()
  })

  it('should show an error and keep the typed text when creating fails', async () => {
    vi.mocked(createKnowledgeItemFromChat).mockRejectedValue(new Error('boom'))
    renderCard()

    selectText('It keeps outer variables alive.')
    fireEvent.click(screen.getByTestId('make-card-button'))
    fireEvent.change(screen.getByTestId('make-card-front'), { target: { value: 'Q?' } })
    fireEvent.click(screen.getByTestId('make-card-create'))

    await waitFor(() => expect(screen.getByTestId('make-card-error')).toBeTruthy())
    expect((screen.getByTestId('make-card-front') as HTMLTextAreaElement).value).toBe('Q?')
  })

  it('should say a connection is needed offline and send nothing', () => {
    setOnline(false)
    renderCard()

    selectText('It keeps outer variables alive.')
    fireEvent.click(screen.getByTestId('make-card-button'))
    fireEvent.change(screen.getByTestId('make-card-front'), { target: { value: 'Q?' } })

    expect(screen.getByTestId('make-card-offline').textContent).toBe('Making a card needs a connection.')
    expect((screen.getByTestId('make-card-create') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('make-card-create'))
    expect(createKnowledgeItemFromChat).not.toHaveBeenCalled()
  })
})
