import { expect, test } from '@playwright/test'

import { setupConfirmedTopic } from '../../fixtures/mock-data'

test('@e2e topic-page-loads — breadcrumb, title, and mode toggle render; switching mode swaps content without reload', async ({
  page,
}) => {
  const { curriculumId, topicId } = await setupConfirmedTopic(Date.now())

  await page.goto(`/probe/${topicId}?mode=quick_test&curriculumId=${curriculumId}`)

  await expect(page.getByRole('button', { name: /curriculum/i })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Stubbed Topic — Module Boundaries' }),
  ).toBeVisible()
  await expect(page.getByTestId('mode-toggle-socratic')).toBeVisible()
  await expect(page.getByTestId('mode-toggle-quick-test')).toBeVisible()

  await expect(
    page.getByTestId('quiz-question').or(page.getByTestId('quiz-complete')),
  ).toBeVisible({ timeout: 45_000 })

  await page.getByTestId('mode-toggle-socratic').click()
  await expect(page.getByTestId('socratic-chat')).toBeVisible({ timeout: 45_000 })

  // Still the same SPA navigation — the breadcrumb/header survive the mode swap.
  await expect(
    page.getByRole('heading', { name: 'Stubbed Topic — Module Boundaries' }),
  ).toBeVisible()
})
