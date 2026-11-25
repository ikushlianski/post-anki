// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NewCardOrderField } from './new-card-order-field'

afterEach(cleanup)

describe('NewCardOrderField', () => {
  it('should offer Oldest first, Newest first and Inherit and report the learner choice', () => {
    const onChange = vi.fn()

    render(<NewCardOrderField own={null} effective="oldest-first" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('study-options-new-card-order-newest-first'))
    fireEvent.click(screen.getByTestId('study-options-new-card-order-inherit'))

    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Oldest first',
      'Newest first',
      'Inherit',
    ])
    expect(onChange).toHaveBeenNthCalledWith(1, 'newest-first')
    expect(onChange).toHaveBeenNthCalledWith(2, null)
  })

  it('should mark Inherit as chosen and show the order being served when the subject sets none', () => {
    render(<NewCardOrderField own={null} effective="newest-first" onChange={vi.fn()} />)

    expect(screen.getByTestId('study-options-new-card-order-inherit').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('study-options-new-card-order-current').textContent).toBe('Serving: Newest first.')
  })

  it('should mark the subject own choice as chosen', () => {
    render(<NewCardOrderField own="newest-first" effective="newest-first" onChange={vi.fn()} />)

    expect(screen.getByTestId('study-options-new-card-order-newest-first').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('study-options-new-card-order-inherit').getAttribute('aria-checked')).toBe('false')
  })
})
