import { type Page } from '@playwright/test'

import { ActionFailure } from '../../../lib'

const ACTION = 'findOptionIndex'

// Options are shuffled once at generation time (SCENARIO 2), so a stubbed
// correct answer's position isn't fixed — resolve it by its visible text
// instead of assuming an index.
export async function findOptionIndex(page: Page, text: string): Promise<number> {
  const options = page.locator('[data-testid^="quiz-option-"]')
  const count = await options.count()

  for (let i = 0; i < count; i += 1) {
    const testId = await options.nth(i).getAttribute('data-testid')
    const optionText = await options.nth(i).textContent()

    if (optionText?.includes(text) && testId) {
      const match = /quiz-option-(\d+)/.exec(testId)

      if (match) {
        return Number(match[1])
      }
    }
  }

  throw ActionFailure.fromMessage(
    `no quiz option contains text "${text}"`,
    ACTION,
  )
}
