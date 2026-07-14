import { type Page } from '@playwright/test'

import { ActionFailure } from '../../../lib'

const ACTION = 'answerSingleSelect'

export interface AnswerSingleSelectParams {
  page: Page
  optionIndex: number
}

export async function answerSingleSelect(
  params: AnswerSingleSelectParams,
): Promise<void> {
  const { page, optionIndex } = params
  const option = page.getByTestId(`quiz-option-${optionIndex}`)

  if (!(await option.count())) {
    throw ActionFailure.missingTestId(`quiz-option-${optionIndex}`, ACTION)
  }

  await option.click()

  try {
    await page.getByTestId('quiz-result').waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    throw ActionFailure.fromMessage(
      'quiz-result did not appear after selecting a single-select option',
      ACTION,
    )
  }
}
