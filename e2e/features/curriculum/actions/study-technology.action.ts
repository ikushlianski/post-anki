import { expect, type Page } from '@playwright/test'

import { ActionFailure, waitForHydration } from '../../../lib'

const ACTION = 'studyTechnology'

export interface StudyTechnologyParams {
  page: Page
  name: string
  docUrl: string
  level?: 'basic' | 'medium' | 'advanced' | ''
}

export interface StudyTechnologyResult {
  name: string
}

export async function studyTechnology(
  params: StudyTechnologyParams,
): Promise<StudyTechnologyResult> {
  const { page, name, docUrl, level } = params

  await page.goto('/')
  await waitForHydration(page)

  const toggle = page.getByTestId('study-technology-toggle').first()

  if (!(await toggle.count())) {
    throw ActionFailure.missingTestId('study-technology-toggle', ACTION)
  }

  await toggle.click()

  const nameInput = page.getByTestId('study-technology-name-input')

  if (!(await nameInput.count())) {
    throw ActionFailure.missingTestId('study-technology-name-input', ACTION)
  }

  await nameInput.fill(name)
  await expect(nameInput).toHaveValue(name)

  const docUrlInput = page.getByTestId('study-technology-doc-url-input')

  if (!(await docUrlInput.count())) {
    throw ActionFailure.missingTestId('study-technology-doc-url-input', ACTION)
  }

  await docUrlInput.fill(docUrl)
  await expect(docUrlInput).toHaveValue(docUrl)

  if (level !== undefined) {
    const levelSelect = page.getByTestId('study-technology-level-select')

    if (!(await levelSelect.count())) {
      throw ActionFailure.missingTestId('study-technology-level-select', ACTION)
    }

    await levelSelect.selectOption(level)
  }

  const submit = page.getByTestId('study-technology-submit')

  if (!(await submit.count())) {
    throw ActionFailure.missingTestId('study-technology-submit', ACTION)
  }

  await submit.click()

  const created = page.getByTestId('curriculum-name').filter({ hasText: name })

  try {
    await created.first().waitFor({ state: 'visible' })
  } catch {
    throw ActionFailure.fromMessage(
      `curriculum "${name}" did not appear in the subject's list after submit`,
      ACTION,
    )
  }

  return { name }
}
