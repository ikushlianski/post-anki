// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { GradeControl } from './knowledge-bit-grade-control'

afterEach(() => cleanup())

describe('GradeControl', () => {
  it('should offer the grades 1 to 5 without any scale caption', () => {
    render(<GradeControl label="Card quality" value={null} onChange={vi.fn()} testId="grade" />)

    for (const grade of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`grade-${grade}`)).toBeDefined()
    }

    expect(screen.queryByTestId('grade-0')).toBeNull()
    expect(screen.queryByTestId('grade-6')).toBeNull()
    expect(screen.queryByText(/poor|excellent/)).toBeNull()
  })

  it('should report the grade that was tapped', () => {
    const onChange = vi.fn()

    render(<GradeControl label="Card quality" value={null} onChange={onChange} testId="grade" />)
    fireEvent.click(screen.getByTestId('grade-4'))

    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('should show only the current grade as pressed', () => {
    render(<GradeControl label="Card quality" value={3} onChange={vi.fn()} testId="grade" />)

    expect(screen.getByTestId('grade-3').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('grade-2').getAttribute('aria-pressed')).toBe('false')
  })

  it('should show no grade as pressed while nothing is graded', () => {
    render(<GradeControl label="Card quality" value={null} onChange={vi.fn()} testId="grade" />)

    expect(screen.getByTestId('grade-3').getAttribute('aria-pressed')).toBe('false')
  })

  it('should name every button by what it grades for assistive technology', () => {
    render(<GradeControl label="Question wording" value={null} onChange={vi.fn()} testId="grade" />)

    expect(screen.getByLabelText('Question wording: 2 of 5')).toBeDefined()
  })

  it('should not report taps while disabled', () => {
    const onChange = vi.fn()

    render(<GradeControl label="Card quality" value={null} onChange={onChange} testId="grade" disabled />)
    fireEvent.click(screen.getByTestId('grade-5'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
