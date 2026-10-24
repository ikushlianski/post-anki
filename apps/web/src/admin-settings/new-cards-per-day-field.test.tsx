// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewCardsPerDayField } from './new-cards-per-day-field'

afterEach(cleanup)

function setup(value = 20) {
  const onChange = vi.fn()

  render(
    <NewCardsPerDayField
      label="New cards per day"
      description="desc"
      value={value}
      onChange={onChange}
      testId="field"
    />,
  )

  return { onChange, input: screen.getByTestId('field-input') as HTMLInputElement }
}

describe('NewCardsPerDayField', () => {
  it('should show the stored limit', () => {
    expect(setup(35).input.value).toBe('35')
  })

  it('should save the typed limit when the learner leaves the field', () => {
    const { input, onChange } = setup()

    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(40)
  })

  it('should clamp a limit above 200 before saving it', () => {
    const { input, onChange } = setup()

    fireEvent.change(input, { target: { value: '900' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(200)
    expect(input.value).toBe('200')
  })

  it('should clamp a limit below 1 before saving it', () => {
    const { input, onChange } = setup()

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('should not save when the limit did not change', () => {
    const { input, onChange } = setup()

    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('NewCardsPerDayField when saving fails', () => {
  it('should show the last saved limit again when the save is rejected', async () => {
    const onChange = vi.fn().mockResolvedValue(false)

    render(
      <NewCardsPerDayField
        label="New cards per day"
        description="desc"
        value={20}
        onChange={onChange}
        testId="field"
      />,
    )

    const input = screen.getByTestId('field-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)

    await waitFor(() => expect(input.value).toBe('20'))
  })
})
