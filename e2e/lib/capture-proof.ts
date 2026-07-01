import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Page } from '@playwright/test'

export interface CaptureProofParams {
  page: Page
  path: string
  testId?: string
}

export async function captureProof(params: CaptureProofParams): Promise<void> {
  const { page, path, testId } = params

  await mkdir(dirname(path), { recursive: true })

  if (testId) {
    const target = page.getByTestId(testId)

    if (await target.count()) {
      await target.first().screenshot({ path })

      return
    }
  }

  await page.screenshot({ path, fullPage: false })
}
