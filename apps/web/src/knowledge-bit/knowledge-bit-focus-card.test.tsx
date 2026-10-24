// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitFocusCard } from './knowledge-bit-focus-card'
import { KnowledgeBitFocusShell } from './knowledge-bit-focus-shell'

function makeBit(overrides: Partial<PendingKnowledgeBitForReview> = {}): PendingKnowledgeBitForReview {
  return {
    id: 'bit-1',
    body: 'Water boils at 100 C at sea level.',
    background: 'Kettle example',
    origin: 'extracted',
    isAiGenerated: false,
    sourceLinks: [],
    variants: [
      { id: 'v1', prompt: 'At what temperature does water boil?', answer: '100 C' },
      { id: 'v2', prompt: 'What boils at 100 C?', answer: 'Water' },
    ],
    ...overrides,
  } as PendingKnowledgeBitForReview
}

function renderCard(
  bit = makeBit(),
  props: Partial<React.ComponentProps<typeof KnowledgeBitFocusCard>> = {},
) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onSaveVariant: vi.fn(async () => true),
    onSaveBit: vi.fn(async () => true),
  }

  render(
    <KnowledgeBitFocusCard
      bit={bit}
      subjectName="Physics"
      sourceText="Original paragraph"
      isResolving={false}
      {...handlers}
      {...props}
    />,
  )

  return handlers
}

afterEach(cleanup)

describe('KnowledgeBitFocusCard', () => {
  it('should show one card with its statement, subject and editable front and back', () => {
    renderCard()

    expect(screen.getByTestId('knowledge-bit-focus-subject').textContent).toBe('Physics')
    expect(screen.getByRole('heading').textContent).toBe('Water boils at 100 C at sea level.')
    expect((screen.getByTestId('knowledge-bit-review-edit-prompt-v1') as HTMLTextAreaElement).value).toBe(
      'At what temperature does water boil?',
    )
    expect((screen.getByTestId('knowledge-bit-review-edit-answer-v1') as HTMLTextAreaElement).value).toBe('100 C')
    expect(screen.getByRole('button', { name: /Hide variations/ })).toBeTruthy()
    expect(screen.getByTestId('knowledge-bit-review-variations-bit-1').hasAttribute('hidden')).toBe(false)
  })

  it('should keep the statement read-only', () => {
    renderCard()

    expect(screen.getByRole('heading').tagName).toBe('H2')
    expect(screen.queryByDisplayValue('Water boils at 100 C at sea level.')).toBeNull()
  })

  it('should move focus to the statement heading when the card appears', () => {
    renderCard()

    expect(document.activeElement).toBe(screen.getByRole('heading'))
  })

  it('should move focus to the next card heading when the card changes', () => {
    const { rerender } = render(
      <KnowledgeBitFocusCard
        bit={makeBit()}
        subjectName={null}
        sourceText={null}
        isResolving={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    )

    rerender(
      <KnowledgeBitFocusCard
        bit={makeBit({ id: 'bit-2', body: 'Second statement' })}
        subjectName={null}
        sourceText={null}
        isResolving={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSaveVariant={vi.fn(async () => true)}
        onSaveBit={vi.fn(async () => true)}
      />,
    )

    expect(document.activeElement?.textContent).toBe('Second statement')
  })

  it('should place Reject on the left and Approve on the right and call them with the bit id', () => {
    const handlers = renderCard()
    const buttons = screen.getAllByRole('button').filter((b) => /^(←)?Reject$|^Approve(→)?$/.test(b.textContent ?? ''))

    expect(buttons.map((b) => b.textContent?.replace(/[←→]/g, ''))).toEqual(['Reject', 'Approve'])

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(handlers.onReject).toHaveBeenCalledWith('bit-1')
    expect(handlers.onApprove).toHaveBeenCalledWith('bit-1')
  })

  it('should give both decision buttons a 44px or larger touch height', () => {
    renderCard()

    expect(screen.getByRole('button', { name: 'Reject' }).className).toContain('min-h-12')
    expect(screen.getByRole('button', { name: 'Approve' }).className).toContain('min-h-12')
  })

  it('should disable both decisions while a decision is being saved', () => {
    renderCard(makeBit(), { isResolving: true })

    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('should not allow approving a card that has no questions yet', () => {
    renderCard(makeBit({ variants: [] }))

    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Writing cards…')).toBeTruthy()
  })

  it('should block decisions while an edit is not saved yet and report editing', async () => {
    const onEditingChange = vi.fn()
    const onSaveVariant = vi.fn(async () => true)

    renderCard(makeBit(), { onEditingChange, onSaveVariant })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-v1'), {
      target: { value: 'New front' },
    })

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    })
    expect(onEditingChange).toHaveBeenCalledWith('bit-1', true)

    await waitFor(() => {
      expect(onSaveVariant).toHaveBeenCalledWith('bit-1', 'v1', 'New front', '100 C')
    }, { timeout: 3000 })
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('should show the example field and the error message', () => {
    renderCard(makeBit(), { errorMessage: 'Could not approve' })

    expect((screen.getByLabelText(/Example/) as HTMLTextAreaElement).value).toBe('Kettle example')
    expect(screen.getByRole('alert').textContent).toBe('Could not approve')
  })

  it('should hide the source section when there is no source text', () => {
    renderCard(makeBit(), { sourceText: null })

    expect(screen.queryByTestId('knowledge-bit-focus-source')).toBeNull()
  })
})

describe('KnowledgeBitFocusShell', () => {
  function renderShell(props: Partial<React.ComponentProps<typeof KnowledgeBitFocusShell>> = {}) {
    const handlers = { onUndo: vi.fn(), onFinish: vi.fn() }

    render(
      <KnowledgeBitFocusShell readyCount={4} waitingCount={0} canUndo={true} {...handlers} {...props}>
        <p>inside</p>
      </KnowledgeBitFocusShell>,
    )

    return handlers
  }

  it('should present itself as a modal dialog around the card', () => {
    renderShell()

    const dialog = screen.getByRole('dialog')

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('inside')
  })

  it('should show how many cards are left and how many are still being written', () => {
    renderShell({ readyCount: 3, waitingCount: 2 })

    expect(screen.getByTestId('knowledge-bit-focus-progress').textContent).toContain('3 to review')
    expect(screen.getByTestId('knowledge-bit-focus-waiting').textContent).toBe('Writing cards… 2 waiting')
  })

  it('should call Undo and Finish, and disable Undo when there is nothing to undo', () => {
    const handlers = renderShell()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-undo'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-finish'))

    expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    expect(handlers.onFinish).toHaveBeenCalledTimes(1)

    cleanup()
    renderShell({ canUndo: false })

    expect((screen.getByTestId('knowledge-bit-focus-undo') as HTMLButtonElement).disabled).toBe(true)
  })
})
