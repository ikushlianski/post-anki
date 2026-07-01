import { chromium, type FullConfig } from '@playwright/test'

import { waitForHydration } from './lib'

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const webPort = process.env.E2E_WEB_PORT ?? '3100'
  const baseURL =
    process.env.PROJECT_DEV_SERVER_URL ?? `http://localhost:${webPort}`

  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(`${baseURL}/`, { waitUntil: 'load' })
    await waitForHydration(page)

    const input = page.getByTestId('subject-name-input')

    if (await input.count()) {
      await input.fill('warmup subject')
      await page.getByTestId('subject-add-button').click()
      await page
        .getByTestId('subject-name')
        .filter({ hasText: 'warmup subject' })
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .catch(() => undefined)
    }
  } finally {
    await browser.close()
  }
}
