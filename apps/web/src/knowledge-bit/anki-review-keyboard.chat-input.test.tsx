// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAnkiReviewKeyboard } from './anki-review-keyboard'

afterEach(cleanup)

function Harness({ onAction }: { onAction: () => void }) {
  useAnkiReviewKeyboard(
    { hasCard: true, revealed: true, busy: false, canUndo: true, editing: false },
    onAction,
  )

  return <input data-testid="chat-input" type="text" />
}

describe('useAnkiReviewKeyboard', () => {
  it('should not grade, undo or bury while the learner types in a chat input', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Harness onAction={onAction} />)
    await user.click(screen.getByTestId('chat-input'))
    await user.keyboard('1234 -ze@')

    expect(onAction).not.toHaveBeenCalled()
  })

  it('should still grade with number keys when focus is outside any input', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Harness onAction={onAction} />)
    await user.keyboard('3')

    expect(onAction).toHaveBeenCalledWith({ type: 'grade', grade: 'good' })
  })
})
