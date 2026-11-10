import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SubjectChatInstructionsForm } from './subject-chat-instructions-form'

function renderForm(initialValue: string, onSubmit = vi.fn()) {
  render(
    <SubjectChatInstructionsForm
      subjectId="s1"
      initialValue={initialValue}
      busy={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )

  return onSubmit
}

describe('SubjectChatInstructionsForm', () => {
  it('should submit the typed instruction trimmed', () => {
    const onSubmit = renderForm('')

    fireEvent.change(screen.getByTestId('subject-chat-s1-instructions'), { target: { value: '  You are a salesperson.  ' } })
    fireEvent.click(screen.getByTestId('subject-chat-s1-confirm'))

    expect(onSubmit).toHaveBeenCalledWith('You are a salesperson.')
  })

  it('should submit null when the learner empties the field so the subject inherits its parent', () => {
    const onSubmit = renderForm('Old persona')

    fireEvent.change(screen.getByTestId('subject-chat-s1-instructions'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('subject-chat-s1-confirm'))

    expect(onSubmit).toHaveBeenCalledWith(null)
  })
})
