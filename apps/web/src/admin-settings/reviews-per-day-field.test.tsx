// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ReviewsPerDayField } from './reviews-per-day-field'

afterEach(cleanup)

function setup(onChange = vi.fn().mockResolvedValue(true), value = 200) {
  render(<ReviewsPerDayField label="Reviews per day" description="d" value={value} onChange={onChange} testId="rpd" />)

  return { onChange, input: screen.getByTestId('rpd-input') as HTMLInputElement }
}

describe('ReviewsPerDayField', () => {
  it('should let the learner switch the daily review limit off with 0', async () => {
    const { onChange, input } = setup()

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(0))
  })

  it('should cap an oversized limit at 9999 before saving', async () => {
    const { onChange, input } = setup()

    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(9999))
    expect(input.value).toBe('9999')
  })

  it('should restore the saved limit when saving fails', async () => {
    const { input } = setup(vi.fn().mockResolvedValue(false))

    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.blur(input)

    await waitFor(() => expect(input.value).toBe('200'))
  })

  it('should not save when the limit is unchanged', () => {
    const { onChange, input } = setup()

    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
  })
})
