import { expect, type Page } from '@playwright/test'

import { ActionFailure } from '../../../lib'

const ACTION = 'answerMultiSelect'

export interface AnswerMultiSelectParams {
  page: Page
  optionIndexes: number[]
}

export async function answerMultiSelect(
  params: AnswerMultiSelectParams,
): Promise<void> {
  const { page, optionIndexes } = params
  const submit = page.getByTestId('quiz-submit-multi')

  if (!(await submit.count())) {
    throw ActionFailure.missingTestId('quiz-submit-multi', ACTION)
  }

  await expect(submit).toBeDisabled()

  for (const index of optionIndexes) {
    const option = page.getByTestId(`quiz-option-${index}`)

    if (!(await option.count())) {
      throw ActionFailure.missingTestId(`quiz-option-${index}`, ACTION)
    }

    await option.click()
  }

  await expect(submit).toBeEnabled()
  await submit.click()

  try {
    await page.getByTestId('quiz-result').waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    throw ActionFailure.fromMessage(
      'quiz-result did not appear after submitting a multi-select answer',
      ACTION,
    )
  }
}
