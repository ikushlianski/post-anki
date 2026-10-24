// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SubjectLearningIntentForm } from './subject-learning-intent-form'

afterEach(cleanup)

function renderForm(overrides: Partial<Parameters<typeof SubjectLearningIntentForm>[0]> = {}) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()

  render(
    <SubjectLearningIntentForm
      subjectId="s1"
      initialValue=""
      defaultIntent="Learn transferable business principles"
      busy={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  )

  return { onSubmit, onCancel }
}

describe('SubjectLearningIntentForm', () => {
  it('should show the effective default as placeholder when the subject has no intent of its own', () => {
    renderForm()

    const input = screen.getByTestId('subject-intent-s1-input') as HTMLTextAreaElement

    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Learn transferable business principles')
  })

  it('should submit the trimmed text the user typed', () => {
    const { onSubmit } = renderForm()

    fireEvent.change(screen.getByTestId('subject-intent-s1-input'), {
      target: { value: '  Apply negotiation tactics  ' },
    })
    fireEvent.click(screen.getByTestId('subject-intent-s1-confirm'))

    expect(onSubmit).toHaveBeenCalledWith('Apply negotiation tactics')
  })

  it('should submit an empty string when the user clears an existing intent so the subject inherits again', () => {
    const { onSubmit } = renderForm({ initialValue: 'Old intent' })

    fireEvent.change(screen.getByTestId('subject-intent-s1-input'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('subject-intent-s1-confirm'))

    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('should show the save error and cancel without submitting', () => {
    const { onSubmit, onCancel } = renderForm({ error: 'Saving failed' })

    expect(screen.getByRole('alert').textContent).toBe('Saving failed')

    fireEvent.click(screen.getByTestId('subject-intent-s1-cancel'))

    expect(onCancel).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
