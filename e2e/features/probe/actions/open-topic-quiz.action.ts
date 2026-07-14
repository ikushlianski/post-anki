import { type Page } from '@playwright/test'

import { ActionFailure, waitForHydration } from '../../../lib'

const ACTION = 'openTopicQuiz'

export interface OpenTopicQuizParams {
  page: Page
  topicId: string
  curriculumId: string
}

export async function openTopicQuiz(params: OpenTopicQuizParams): Promise<void> {
  const { page, topicId, curriculumId } = params

  await page.goto(
    `/probe/${topicId}?mode=quick_test&curriculumId=${curriculumId}`,
  )
  await waitForHydration(page)

  const question = page.getByTestId('quiz-question')
  const complete = page.getByTestId('quiz-complete')

  try {
    await Promise.race([
      question.waitFor({ state: 'visible', timeout: 45_000 }),
      complete.waitFor({ state: 'visible', timeout: 45_000 }),
    ])
  } catch {
    throw ActionFailure.fromMessage(
      `quiz did not render a question or a complete state for topic ${topicId}`,
      ACTION,
    )
  }
}
