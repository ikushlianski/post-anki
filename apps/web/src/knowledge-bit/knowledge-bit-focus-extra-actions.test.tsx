// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitFocusCard } from './knowledge-bit-focus-card'

const BIT = {
  id: 'bit-1',
  body: 'Water boils at 100 C.',
  background: null,
  origin: 'extracted',
  isAiGenerated: false,
  sourceLinks: [],
  variants: [{ id: 'v1', kind: 'wh_question', prompt: 'Q', answer: 'A' }],
} as PendingKnowledgeBitForReview

function renderCard(
  bit: PendingKnowledgeBitForReview = BIT,
  props: Partial<React.ComponentProps<typeof KnowledgeBitFocusCard>> = {},
) {
  const handlers = { onChat: vi.fn(), onInbox: vi.fn(), onExample: vi.fn() }

  render(
    <KnowledgeBitFocusCard
      bit={bit}
      subjectName={null}
      sourceText={null}
      isResolving={false}
      onApprove={vi.fn()}
      onReject={vi.fn()}
      onSaveVariant={vi.fn(async () => true)}
      onSaveBit={vi.fn(async () => true)}
      {...handlers}
      {...props}
    />,
  )

  return handlers
}

afterEach(cleanup)

describe('KnowledgeBitFocusCard Set aside and AI example actions', () => {
  it('should show Chat about this, Set aside and AI example next to Reject and Approve with C, I and E hints', () => {
    renderCard()

    expect(screen.getByRole('button', { name: /Chat about this/ }).textContent).toContain('C')
    expect(screen.getByRole('button', { name: /Set aside/ }).textContent).toContain('I')
    expect(screen.getByRole('button', { name: /AI example/ }).textContent).toContain('E')
    expect(screen.getByTestId('knowledge-bit-focus-reject-bit-1')).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-focus-approve-bit-1')).toBeTruthy()
  })

  it('should call the chat and example handlers with the item id', () => {
    const { onChat, onInbox, onExample } = renderCard()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-chat-bit-1'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-inbox-bit-1'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-example-bit-1'))

    expect(onChat).toHaveBeenCalledWith('bit-1')
    expect(onInbox).toHaveBeenCalledWith('bit-1')
    expect(onExample).toHaveBeenCalledWith('bit-1')
  })

  it('should disable the chat, inbox and example buttons while a request is running so actions cannot overlap', () => {
    renderCard(BIT, { isResolving: true })

    expect((screen.getByTestId('knowledge-bit-focus-chat-bit-1') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('knowledge-bit-focus-inbox-bit-1') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('knowledge-bit-focus-example-bit-1') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should label the button New AI example and tag the example once an AI example exists', () => {
    renderCard({ ...BIT, background: 'Kettle', exampleAiGeneratedAt: '2026-10-28T10:00:00.000Z' })

    expect(screen.getByTestId('knowledge-bit-focus-example-bit-1').textContent).toContain('New AI example')
    expect(screen.getByTestId('knowledge-bit-focus-example-ai-tag-bit-1').textContent).toBe('AI')
  })

  it('should not tag a human-written example as AI', () => {
    renderCard({ ...BIT, background: 'Mine', exampleAiGeneratedAt: null })

    expect(screen.queryByTestId('knowledge-bit-focus-example-ai-tag-bit-1')).toBeNull()
  })

  it('should explain the limit and disable the button after 5 examples', () => {
    renderCard(BIT, { example: { error: null, left: 0, version: 1 } })

    expect(screen.getByTestId('knowledge-bit-focus-example-notice-bit-1').textContent).toBe(
      '5 AI examples used for this item',
    )
    expect((screen.getByTestId('knowledge-bit-focus-example-bit-1') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should show a failed example request inline as an alert', () => {
    renderCard(BIT, { example: { error: "Couldn't write an example. Try again.", left: null, version: 0 } })

    expect(screen.getByRole('alert').textContent).toBe("Couldn't write an example. Try again.")
  })

  it('should request an example from a touch drag up at the bottom edge', () => {
    const { onExample } = renderCard()
    const scroll = screen.getByTestId('knowledge-bit-focus-scroll')
    const point = (y: number) => ({ clientY: y, clientX: 0, identifier: 1, target: scroll })

    fireEvent.touchStart(scroll, { touches: [point(300)], changedTouches: [point(300)] })
    fireEvent.touchEnd(scroll, { touches: [], changedTouches: [point(100)] })

    expect(onExample).toHaveBeenCalledWith('bit-1')
  })

  it('should send the item to Chat from a touch drag down at the top edge', () => {
    const { onChat } = renderCard()
    const scroll = screen.getByTestId('knowledge-bit-focus-scroll')
    const point = (y: number) => ({ clientY: y, clientX: 0, identifier: 1, target: scroll })

    fireEvent.touchStart(scroll, { touches: [point(10)], changedTouches: [point(10)] })
    fireEvent.touchEnd(scroll, { touches: [], changedTouches: [point(150)] })

    expect(onChat).toHaveBeenCalledWith('bit-1')
  })
})
