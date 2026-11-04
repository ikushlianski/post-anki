// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseStepsInput, StepsField } from './steps-field'

afterEach(cleanup)

function setup(value = [1, 10]) {
  const onChange = vi.fn()

  render(
    <StepsField label="Steps" description="desc" value={value} onChange={onChange} testId="steps" />,
  )

  return { onChange, input: screen.getByTestId('steps-input') as HTMLInputElement }
}

describe('parseStepsInput', () => {
  it.each([
    ['1, 10', [1, 10]],
    ['5 30 60', [5, 30, 60]],
    ['15', [15]],
  ])('should read %s as the steps %j', (text, steps) => {
    expect(parseStepsInput(text)).toEqual(steps)
  })

  it.each([[''], ['abc'], ['0'], ['1.5'], ['2000'], ['1,2,3,4,5,6,7,8,9,10,11']])(
    'should refuse %s as a steps list',
    (text) => {
      expect(parseStepsInput(text)).toBeNull()
    },
  )
})

describe('StepsField', () => {
  it('should show the current steps', () => {
    expect(setup([5, 30]).input.value).toBe('5, 30')
  })

  it('should save the typed steps when the learner leaves the field', () => {
    const { input, onChange } = setup()

    fireEvent.change(input, { target: { value: '2 20' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith([2, 20])
  })

  it('should refuse an empty list and tell the learner instead of saving', () => {
    const { input, onChange } = setup()

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('steps-invalid')).toBeTruthy()
  })

  it('should not save when the steps did not change', () => {
    const { input, onChange } = setup()

    fireEvent.blur(input)

    expect(onChange).not.toHaveBeenCalled()
  })
})
