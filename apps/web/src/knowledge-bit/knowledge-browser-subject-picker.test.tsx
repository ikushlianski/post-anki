// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBrowserSubjectPicker } from './knowledge-browser-subject-picker'

const OPTIONS = [
  { id: 's1', label: 'Math' },
  { id: 's2', label: 'Math › Algebra' },
  { id: 's3', label: 'History' },
]

function open(onChange = vi.fn()) {
  render(<KnowledgeBrowserSubjectPicker subjectId={null} options={OPTIONS} onChange={onChange} />)
  fireEvent.click(screen.getByTestId('knowledge-browser-subject-button'))

  return onChange
}

describe('KnowledgeBrowserSubjectPicker', () => {
  afterEach(() => {
    cleanup()
  })

  it('should focus the search box as soon as the picker opens', () => {
    open()

    expect(document.activeElement).toBe(screen.getByTestId('subject-picker-search'))
  })

  it('should narrow subjects and sub-subjects by name and keep the parent visible', () => {
    open()
    fireEvent.change(screen.getByTestId('subject-picker-search'), { target: { value: 'ALGEB' } })

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Math › Algebra'])
  })

  it('should pick the single remaining match when Enter is pressed', () => {
    const onChange = open()
    const search = screen.getByTestId('subject-picker-search')

    fireEvent.change(search, { target: { value: 'hist' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('s3')
  })

  it('should not pick anything on Enter while several subjects still match', () => {
    const onChange = open()
    const search = screen.getByTestId('subject-picker-search')

    fireEvent.change(search, { target: { value: 'a' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })
})
