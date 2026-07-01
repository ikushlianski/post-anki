import { expect, test } from '@playwright/test'

import { captureProof, closeDb, pauseForHuman, rowExists } from '../../../../lib'
import { createSubject } from '../../../subject/actions'
import { uniqueSubjectName } from '../../../subject/fixtures/mock-data'

test.afterAll(async () => {
  await closeDb()
})

test('@e2e subject-add — a new subject appears in the list and persists', async ({
  page,
}, testInfo) => {
  const name = uniqueSubjectName(testInfo.workerIndex + Date.now())

  await createSubject({ page, name })

  await expect(
    page.getByTestId('subject-name').filter({ hasText: name }),
  ).toBeVisible()

  expect(await rowExists('subjects', { name })).toBe(true)

  await captureProof({
    page,
    testId: 'subject-card',
    path: 'e2e/proof/subject/add-subject.png',
  })
  await pauseForHuman({ page })
})
