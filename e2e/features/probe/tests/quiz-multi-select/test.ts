import { expect, test } from '@playwright/test'

import { closeDb, countWhere } from '../../../../lib'
import { answerSingleSelect, findOptionIndex, openTopicQuiz } from '../../actions'
import { setupConfirmedTopic } from '../../fixtures/mock-data'

const MULTI_PROMPT =
  'Stubbed Question — Select every statement that is true about idempotency keys.'

test.afterAll(async () => {
  await closeDb()
})

test('@e2e quiz-multi-select — toggle multiple options, one explicit submit, all-or-nothing scoring', async ({
  page,
}) => {
  const { curriculumId, topicId } = await setupConfirmedTopic(Date.now())

  await openTopicQuiz({ page, topicId, curriculumId })

  // Answer the first (single-select) stubbed question to advance to the
  // multi-select one.
  const singleIndex = await findOptionIndex(page, 'False')
  await answerSingleSelect({ page, optionIndex: singleIndex })
  await page.getByTestId('quiz-next').click()

  await expect(page.getByTestId('quiz-prompt')).toHaveText(MULTI_PROMPT, {
    timeout: 30_000,
  })

  const submit = page.getByTestId('quiz-submit-multi')
  await expect(submit).toBeDisabled()

  const partialIndex = await findOptionIndex(page, 'Stub Option A — safe to retry')
  await page.getByTestId(`quiz-option-${partialIndex}`).click()

  // Toggling one checkbox must not auto-submit — this is what makes it
  // "select all that apply, then one submit" rather than single-select's
  // one-click-per-option.
  expect(await page.getByTestId('quiz-result').count()).toBe(0)
  await expect(submit).toBeEnabled()

  await submit.click()

  await expect(page.getByTestId('quiz-result')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('quiz-result')).toContainText('Not quite.')

  expect(
    await countWhere('probe_session_questions', {
      topic_id: topicId,
      prompt: MULTI_PROMPT,
      type: 'multi',
      outcome: 'fail',
    }),
  ).toBe(1)
})
