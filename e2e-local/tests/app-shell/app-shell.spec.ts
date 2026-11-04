import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function openShell(page: Page): Promise<void> {
  await page.goto('/add-knowledge', { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
}

for (const viewport of viewports) {
  test.describe(`App shell at ${viewport.name} size`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('should focus the skip link on the first Tab press', async ({ page }) => {
      await openShell(page);

      await page.keyboard.press('Tab');

      await expect(page.getByTestId('skip-to-content')).toBeFocused();
      await expect(page.getByTestId('skip-to-content')).toHaveText('Skip to content');
    });

    test('should show the page name in the tab title', async ({ page }) => {
      await openShell(page);

      await expect(page).toHaveTitle(/^(\(\d+\) )?Add knowledge · Post Anki$/);
    });

    test('should open search with slash, offer adding knowledge when nothing matches, and close with escape', async ({
      page,
    }) => {
      await openShell(page);

      await page.keyboard.press('/');
      const input = page.getByTestId('global-search-input');
      await expect(input).toBeFocused();

      await input.fill('zzqxnomatch-e2e-shell');
      await expect(page.getByTestId('global-search-results')).toBeVisible();
      await expect(page.getByRole('link', { name: /Add this as knowledge/ })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('global-search-results')).toBeHidden();
    });
  });
}
