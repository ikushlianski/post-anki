import { fireEvent, screen } from '@testing-library/react'

export function pickSearchableOption(testId: string, optionId: string) {
  fireEvent.click(screen.getByTestId(testId))
  fireEvent.mouseDown(screen.getByTestId(`${testId}-option-${optionId}`))
}

export function searchableValue(testId: string): string {
  return (screen.getByTestId(testId) as HTMLInputElement).value
}
