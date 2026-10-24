// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelComparisonGradePicker } from './model-comparison-grade-picker'

afterEach(cleanup)

describe('ModelComparisonGradePicker', () => {
  it('should show the saved grade as pressed when it opens', () => {
    render(<ModelComparisonGradePicker label="Card quality" initial={4} onSelect={vi.fn()} testId="g" />)

    expect(screen.getByTestId('g-4').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('g-2').getAttribute('aria-pressed')).toBe('false')
  })

  it('should save the chosen grade at once and say it was saved', async () => {
    const onSelect = vi.fn().mockResolvedValue(true)

    render(<ModelComparisonGradePicker label="Card quality" initial={null} onSelect={onSelect} testId="g" />)
    fireEvent.click(screen.getByTestId('g-5'))

    await waitFor(() => expect(screen.getByTestId('g-status').textContent).toBe('Saved'))

    expect(onSelect).toHaveBeenCalledWith(5)
    expect(screen.getByTestId('g-5').getAttribute('aria-pressed')).toBe('true')
  })

  it('should keep the chosen grade selected and show an error when saving fails, so it can be tried again', async () => {
    const onSelect = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    render(<ModelComparisonGradePicker label="Card quality" initial={null} onSelect={onSelect} testId="g" />)
    fireEvent.click(screen.getByTestId('g-3'))

    await waitFor(() => expect(screen.getByTestId('g-status').textContent).toContain('Could not save'))

    expect(screen.getByTestId('g-3').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('g-3'))

    await waitFor(() => expect(screen.getByTestId('g-status').textContent).toBe('Saved'))
  })
})
