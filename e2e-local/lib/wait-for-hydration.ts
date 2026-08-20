import type { Page } from '@playwright/test';

// Same signal verification-repo's actions use
// (verification-repo/projects/post-anki/post-anki/lib/wait-for-hydration.ts):
// TanStack Router sets window.__TSR_ROUTER__ in its constructor, before the
// app is interactive. Ported (not imported) so e2e-local has no dependency
// on the sibling verification-repo checkout.
declare global {
  interface Window {
    __TSR_ROUTER__?: unknown;
  }
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__TSR_ROUTER__));
}
