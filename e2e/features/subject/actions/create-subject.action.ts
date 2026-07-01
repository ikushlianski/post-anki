import { expect, type Page } from '@playwright/test'

import { ActionFailure, waitForHydration } from '../../../lib'

const ACTION = 'createSubject'

export interface CreateSubjectParams {
  page: Page
  name: string
  description?: string
  requireSources?: boolean
}

export interface CreateSubjectResult {
  name: string
}

export async function createSubject(
  params: CreateSubjectParams,
): Promise<CreateSubjectResult> {
  const { page, name, description, requireSources } = params

  await page.goto('/')
  await waitForHydration(page)

  const input = page.getByTestId('subject-name-input')

  if (!(await input.count())) {
    throw ActionFailure.missingTestId('subject-name-input', ACTION)
  }

  await input.fill(name)
  await expect(input).toHaveValue(name)

  if (description !== undefined) {
    const descriptionInput = page.getByTestId('subject-description-input')

    if (!(await descriptionInput.count())) {
      throw ActionFailure.missingTestId('subject-description-input', ACTION)
    }

    await descriptionInput.fill(description)
  }

  if (requireSources) {
    const requireSourcesInput = page.getByTestId('subject-require-sources-input')

    if (!(await requireSourcesInput.count())) {
      throw ActionFailure.missingTestId('subject-require-sources-input', ACTION)
    }

    await requireSourcesInput.check()
  }

  const addButton = page.getByTestId('subject-add-button')

  if (!(await addButton.count())) {
    throw ActionFailure.missingTestId('subject-add-button', ACTION)
  }

  await addButton.click()

  const created = page.getByTestId('subject-name').filter({ hasText: name })

  try {
    await created.first().waitFor({ state: 'visible' })
  } catch {
    throw ActionFailure.fromMessage(
      `subject "${name}" did not appear in the list after submit`,
      ACTION,
    )
  }

  return { name }
}
