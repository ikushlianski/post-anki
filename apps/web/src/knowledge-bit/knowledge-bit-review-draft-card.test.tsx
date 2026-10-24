// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitReviewDraftCard } from './knowledge-bit-review-draft-card'
import type { ManualDraft } from './knowledge-bit-review-manual-drafts'

const DRAFT: ManualDraft = { id: 'draft-1', sourceId: 's1', bitId: null, focusTick: 0 }

const CREATED_BIT: PendingKnowledgeBitForReview = {
  id: 'bit-new',
  body: 'Front text',
  background: null,
  origin: 'manual', isAiGenerated: false, sourceLinks: [],
  variants: [{ id: 'var-new', kind: 'basic', prompt: 'Front text', answer: 'Back text' }],
}

const onCreate = vi.fn<(input: { front: string; back: string; example?: string }) => Promise<boolean>>()
const onCancel = vi.fn()
const onSaveVariant = vi.fn<(bitId: string, variantId: string, prompt: string, answer: string) => Promise<boolean>>()
const onSaveBit = vi.fn<(bitId: string, body: string, background: string | null) => Promise<boolean>>()

function card(bit?: PendingKnowledgeBitForReview) {
  return (
    <ul>
      <KnowledgeBitReviewDraftCard
        draft={bit ? { ...DRAFT, bitId: bit.id } : DRAFT}
        bit={bit}
        isResolving={false}
        errorMessage={null}
        onCreate={onCreate}
        onCancel={onCancel}
        onEditingChange={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={onSaveVariant}
        onSaveBit={onSaveBit}
      />
    </ul>
  )
}

function type(field: 'front' | 'back' | 'example', value: string) {
  fireEvent.change(screen.getByTestId(`knowledge-bit-review-draft-${field}-draft-1`), {
    target: { value },
  })
}

async function idle(ms = 2000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('KnowledgeBitReviewDraftCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    onCreate.mockReset()
    onCreate.mockResolvedValue(true)
    onCancel.mockReset()
    onSaveVariant.mockReset()
    onSaveVariant.mockResolvedValue(true)
    onSaveBit.mockReset()
    onSaveBit.mockResolvedValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should keep an empty draft in the browser and never contact the server', async () => {
    render(card())

    await idle(5000)

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('should not create the card while only the Front has text', async () => {
    render(card())
    type('front', 'Front text')

    await idle()

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('should create exactly one card with trimmed text once Front and Back both have text', async () => {
    render(card())
    type('front', '  Front text ')
    type('back', ' Back text\n')
    type('example', ' An example ')

    await idle(5000)

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({
      front: 'Front text',
      back: 'Back text',
      example: 'An example',
    })
  })

  it('should save an Example typed after creation as a background-only edit without creating again', async () => {
    const view = render(card())

    type('front', 'Front text')
    type('back', 'Back text')
    await idle()
    view.rerender(card(CREATED_BIT))
    type('example', 'Later example')
    await idle()

    expect(onSaveBit).toHaveBeenCalledWith('bit-new', 'Front text', 'Later example')
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onSaveVariant).not.toHaveBeenCalled()
  })

  it('should save a Front edit after creation through the variant edit route', async () => {
    const view = render(card())

    type('front', 'Front text')
    type('back', 'Back text')
    await idle()
    view.rerender(card(CREATED_BIT))
    type('front', 'Better front')
    await idle()

    expect(onSaveVariant).toHaveBeenCalledWith('bit-new', 'var-new', 'Better front', 'Back text')
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('should never send text that is over the length limit and should tell the reviewer', async () => {
    render(card())
    type('front', 'F'.repeat(301))
    type('back', 'Back text')

    await idle(5000)

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-review-draft-limit-draft-1').textContent).toContain(
      'Front is over 300',
    )
  })

  it('should discard the draft on Cancel without any server call', () => {
    render(card())
    type('front', 'Front text')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-draft-cancel-draft-1'))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('should keep the same text fields and offer Approve and Reject without grades after creation', async () => {
    const view = render(card())
    const front = screen.getByTestId('knowledge-bit-review-draft-front-draft-1')
    const example = screen.getByTestId('knowledge-bit-review-draft-example-draft-1')

    type('front', 'Front text')
    type('back', 'Back text')
    await idle()
    view.rerender(card(CREATED_BIT))

    expect(screen.getByTestId('knowledge-bit-review-draft-front-draft-1')).toBe(front)
    expect(screen.getByTestId('knowledge-bit-review-draft-example-draft-1')).toBe(example)
    expect(screen.getByTestId('knowledge-bit-review-approve-bit-new')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-reject-bit-new')).toBeDefined()
    expect(view.container.querySelector('[data-testid*="grade"]')).toBeNull()
    expect(screen.queryByTestId('knowledge-bit-review-draft-cancel-draft-1')).toBeNull()
  })
})
