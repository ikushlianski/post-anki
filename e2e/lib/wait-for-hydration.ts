import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __TSR_ROUTER__?: unknown
  }
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__TSR_ROUTER__))
}
