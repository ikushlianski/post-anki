import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SubjectExtractionGuidanceForm, toDraft } from './subject-extraction-guidance-form'

describe('toDraft', () => {
  it('should clear guidance when the learner empties the fields', () => {
    expect(toDraft('  ', [{ front: '', back: '', example: '' }])).toEqual({
      extractionInstructions: null,
      extractionExamples: null,
    })
  })

  it('should keep only complete example cards', () => {
    const draft = toDraft('Be brief', [
      { front: 'Q', back: 'A', example: '' },
      { front: 'half', back: '', example: '' },
    ])

    expect(draft).toEqual({ extractionInstructions: 'Be brief', extractionExamples: [{ front: 'Q', back: 'A' }] })
  })
})

describe('SubjectExtractionGuidanceForm', () => {
  it('should submit the typed instructions', () => {
    const onSubmit = vi.fn()

    render(
      <SubjectExtractionGuidanceForm
        subjectId="s1"
        initialInstructions=""
        initialExamples={[]}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByTestId('subject-guidance-s1-instructions'), { target: { value: 'Short answers' } })
    fireEvent.click(screen.getByTestId('subject-guidance-s1-confirm'))

    expect(onSubmit).toHaveBeenCalledWith({ extractionInstructions: 'Short answers', extractionExamples: null })
  })
})
