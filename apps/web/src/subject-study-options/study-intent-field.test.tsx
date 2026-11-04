// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { intentSourceText, StudyIntentField } from './study-intent-field'

afterEach(cleanup)

describe('StudyIntentField', () => {
  it('should offer Same as parent, Exam and Long-term and report the choice', () => {
    const onChange = vi.fn()

    render(<StudyIntentField value="inherit" onChange={onChange} testId="intent" />)
    fireEvent.change(screen.getByTestId('intent-input'), { target: { value: 'long_term' } })

    expect(Array.from(screen.getByTestId('intent-input').querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Same as parent',
      'Exam',
      'Long-term',
    ])
    expect(onChange).toHaveBeenCalledWith('long_term')
  })
})

describe('intentSourceText', () => {
  it('should name the app default for an untouched subject', () => {
    expect(intentSourceText({ studyIntent: 'long_term', examDate: null, source: 'app' }, 'child', {})).toBe(
      'Long-term, the app default.',
    )
  })
})
