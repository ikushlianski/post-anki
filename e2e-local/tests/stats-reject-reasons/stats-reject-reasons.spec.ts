import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedStatsRejectReasons, type SeededStatsRejectReasons } from './seed-stats-reject-reasons';

async function violations(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa']).analyze();

  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
}

test.describe('statistics reject reasons and nothing extracted', () => {
  let seeded: SeededStatsRejectReasons;

  test.beforeAll(async () => {
    seeded = await seedStatsRejectReasons();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should show seeded reject reason counts and have no accessibility violations', async ({ page }) => {
    await page.goto('/statistics', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const section = page.getByTestId('reject-reasons');

    await expect(page.getByTestId('reject-reasons-list')).toBeVisible();

    for (const reason of ['wrong_language', 'bad_format']) {
      await expect(section.getByTestId(`reject-reason-${reason}`)).toContainText(
        new RegExp(`(?<!\\d)${seeded.reasonCounts[reason]} \\(`),
      );
    }

    expect(await violations(page, '[data-testid="reject-reasons"]')).toEqual([]);
  });

  test('should show the notes-that-gave-no-cards share for the current week and have no accessibility violations', async ({
    page,
  }) => {
    await page.goto('/statistics', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const { processed, nothingExtracted } = seeded.nothingExtracted;

    await expect(page.getByTestId('nothing-extracted-label')).toContainText(`(${nothingExtracted} of ${processed})`);
    expect(await violations(page, '[data-testid="nothing-extracted"]')).toEqual([]);
  });
});
