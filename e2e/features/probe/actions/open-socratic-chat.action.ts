import { type Page } from '@playwright/test'

import { ActionFailure, waitForHydration } from '../../../lib'

const ACTION = 'openSocraticChat'

export interface OpenSocraticChatParams {
  page: Page
  topicId: string
  curriculumId: string
}

export async function openSocraticChat(
  params: OpenSocraticChatParams,
): Promise<void> {
  const { page, topicId, curriculumId } = params

  await page.goto(`/probe/${topicId}?mode=socratic&curriculumId=${curriculumId}`)
  await waitForHydration(page)

  const chat = page.getByTestId('socratic-chat')

  try {
    await chat.waitFor({ state: 'visible', timeout: 45_000 })
  } catch {
    throw ActionFailure.missingTestId('socratic-chat', ACTION)
  }

  try {
    await page
      .getByTestId('socratic-message-mentor')
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
  } catch {
    throw ActionFailure.fromMessage(
      `socratic chat never rendered an opening mentor message for topic ${topicId}`,
      ACTION,
    )
  }
}
