import { expect, test } from '@playwright/test'

import { closeDb, countWhere } from '../../../../lib'
import { answerSingleSelect, findOptionIndex, openTopicQuiz } from '../../actions'
import { authHeaders, setupConfirmedTopic } from '../../fixtures/mock-data'

const apiPort = process.env.E2E_API_PORT ?? '8031'
const apiBase = `http://localhost:${apiPort}`

test.afterAll(async () => {
  await closeDb()
})

test('@e2e quiz-single-select — option order is stable across reload and scores an exact match', async ({
  page,
  request,
}) => {
  const { curriculumId, topicId } = await setupConfirmedTopic(Date.now())

  await openTopicQuiz({ page, topicId, curriculumId })

  await expect(page.getByTestId('quiz-prompt')).toHaveText(
    'Stubbed Question — Is caching always safe to apply blindly?',
  )

  const optionsFromUi = await page
    .locator('[data-testid^="quiz-option-"]')
    .allTextContents()
  // Array.prototype.sort() mutates in place — compare a copy so
  // optionsFromUi itself keeps its real, possibly-shuffled DOM order for the
  // exact-order comparison below.
  expect([...optionsFromUi].sort()).toEqual(['False', 'True'])

  // "Reload mid-question" means: prepareProbeSession is called again for the
  // same still-active, unanswered session (exactly what the web app's own
  // useQuery does on a fresh page load) — it must resume the SAME persisted
  // (shuffled-once) row rather than generating a new one. Verified directly
  // against the API/DB rather than a full browser reload, which is a more
  // precise proof of "shuffled once, persisted" than re-navigating a page and
  // racing client hydration timing.
  const resumeRes = await request.post(`${apiBase}/probe-sessions`, {
    headers: authHeaders,
    data: { scope: 'topic', scopeId: topicId, allowMultiSelect: true },
  })
  const resumed = (await resumeRes.json()) as {
    id: string
    questions: { order: number; options: string[] }[]
  }
  const resumedFirst = resumed.questions.find((q) => q.order === 1)

  expect(resumedFirst?.options).toEqual(optionsFromUi)

  expect(
    await countWhere('probe_sessions', { scope_id: topicId, status: 'active' }),
  ).toBe(1)

  const correctIndex = await findOptionIndex(page, 'False')
  await answerSingleSelect({ page, optionIndex: correctIndex })

  await expect(page.getByTestId('quiz-result')).toContainText('Correct.')

  // Scoped by topic_id (not just prompt) so this assertion stays isolated from
  // other tests that share the same stubbed batch content for their own topics.
  expect(
    await countWhere('probe_session_questions', {
      topic_id: topicId,
      prompt: 'Stubbed Question — Is caching always safe to apply blindly?',
      type: 'single',
      outcome: 'pass',
    }),
  ).toBe(1)
})
