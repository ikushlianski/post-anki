import type { Page } from '@playwright/test';

// window.__TSR_ROUTER__ (TanStack Router's own global) is set in the
// router's constructor, before the app is interactive — waiting on it alone
// resolves too early. This app's root route (apps/web/src/routes/__root.tsx)
// instead sets window.__APP_HYDRATED__ = true from a useEffect in its shell
// component, which only fires once React has actually committed and hydrated
// the root document (and, for routes with no code-split chunk beyond the
// root router, the current route's content along with it).
//
// The flag is set once per document load and never cleared, so this is only
// meaningful right after page.goto() (a full document load) — not after a
// client-side navigation within an already-hydrated page.
declare global {
  interface Window {
    __APP_HYDRATED__?: boolean;
  }
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__APP_HYDRATED__ === true);
}
