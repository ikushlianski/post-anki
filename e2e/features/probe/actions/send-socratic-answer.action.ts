import { expect, type Page } from '@playwright/test'

import { ActionFailure } from '../../../lib'

const ACTION = 'sendSocraticAnswer'

export interface SendSocraticAnswerParams {
  page: Page
  answer: string
}

export async function sendSocraticAnswer(
  params: SendSocraticAnswerParams,
): Promise<void> {
  const { page, answer } = params
  const input = page.getByTestId('socratic-input')
  const send = page.getByTestId('socratic-send')

  if (!(await input.count())) {
    throw ActionFailure.missingTestId('socratic-input', ACTION)
  }

  if (answer.trim().length === 0) {
    await input.fill(answer)
    await expect(send).toBeDisabled()

    return
  }

  await input.fill(answer)
  await expect(send).toBeEnabled()
  await send.click()

  try {
    await page
      .getByTestId('socratic-typing-indicator')
      .waitFor({ state: 'detached', timeout: 45_000 })
  } catch {
    throw ActionFailure.fromMessage(
      'the typing indicator never cleared after sending a Socratic answer',
      ACTION,
    )
  }
}
