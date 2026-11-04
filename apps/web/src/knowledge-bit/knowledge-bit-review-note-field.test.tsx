// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { KnowledgeBitReviewNoteField } from './knowledge-bit-review-note-field'

afterEach(cleanup)

function setup(mode: 'cloze' | 'list', text: string) {
  const onSave = vi.fn(async () => true)

  render(
    <KnowledgeBitReviewNoteField
      bitId="b1"
      target={{ mode, variantId: 'v1', text }}
      onSave={onSave}
      onBusyChange={vi.fn()}
    />,
  )

  return onSave
}

describe('KnowledgeBitReviewNoteField', () => {
  it('should show the whole note and one preview line per card', () => {
    setup('cloze', 'The {{c1::sky}} is {{c2::blue}}')

    expect((screen.getByTestId('knowledge-bit-review-edit-note-b1') as HTMLTextAreaElement).value).toBe(
      'The {{c1::sky}} is {{c2::blue}}',
    )
    expect(screen.getByTestId('knowledge-bit-review-note-preview-b1').children).toHaveLength(2)
  })

  it('should show the shared problem and never save a note that lost its gaps', async () => {
    const onSave = setup('cloze', 'The {{c1::sky}} is blue')

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-note-b1'), { target: { value: 'The sky is blue' } })

    expect(screen.getByTestId('knowledge-bit-review-note-problem-b1')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('should save a valid edited list as one piece of text', async () => {
    const onSave = setup('list', 'Steps\none\ntwo\nthree')

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-note-b1'), {
      target: { value: 'Steps\none\ntwo\nthree\nfour' },
    })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Steps\none\ntwo\nthree\nfour'), { timeout: 3000 })
  })
})
