import type { Locator } from '@playwright/test';

// Ported from verification-repo's wait-for-hydrated-click.ts. TanStack
// Router code-splits routes, so a hard navigation can paint a button before
// its route chunk has hydrated and attached React's onClick handler.
// waitForHydration only proves the root shell has committed — a lazily
// loaded route chunk further down the tree can still lag behind that.
// Polling for a React-internal props key on the actual DOM node is the only
// reliable per-element signal.
export async function clickOnceHydrated(locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' });

  await locator.page().waitForFunction((el) => {
    if (!el) {
      return false;
    }

    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));

    if (!key) {
      return false;
    }

    const props = (el as unknown as Record<string, { onClick?: unknown }>)[key];

    return typeof props?.onClick === 'function';
  }, await locator.elementHandle());

  await locator.click();
}
