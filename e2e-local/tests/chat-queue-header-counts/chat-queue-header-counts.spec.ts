import { expect, test } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedHeaderCountsCards, type SeededHeaderCounts } from './seed-header-counts-cards';

test.describe('chat queue header counts', () => {
  let seeded: SeededHeaderCounts;

  test.beforeAll(async () => {
    seeded = await seedHeaderCountsCards();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should show waiting and oldest-wait figures for seeded cards and update them on snooze', async ({
    page,
  }) => {
    const { cards, baseline } = seeded;
    const target = cards[1]!;
    const waiting = baseline.waiting + cards.length;

    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const summary = page.getByTestId('chat-queue-summary');
    const oldest = page.getByTestId('chat-queue-oldest-wait');

    await expect(page.getByTestId(`chat-queue-row-${target.id}`)).toBeVisible();
    await expect(summary).toContainText(`${waiting} waiting`);

    if (baseline.snoozed > 0) {
      await expect(summary).toContainText(`${baseline.snoozed} snoozed`);
    } else {
      await expect(summary).not.toContainText('snoozed');
    }

    await expect(oldest).toContainText('Oldest card has waited');

    const days = Number(/waited (\d+) days/.exec((await oldest.textContent()) ?? '')?.[1]);

    expect(days).toBeGreaterThanOrEqual(5);

    const row = page.getByTestId(`chat-queue-row-${target.id}`);
    const rowCount = await page.locator('[data-testid^="chat-queue-row-"]').count();

    for (let step = 0; step < rowCount && (await row.getAttribute('aria-current')) !== 'true'; step += 1) {
      await page.keyboard.press('j');
    }

    await expect(row).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('s');

    await expect(page.getByTestId(`chat-queue-snoozed-${target.id}`)).toContainText('Snoozed until');
    await expect(summary).toContainText(`${waiting - 1} waiting`);
    await expect(summary).toContainText(`${baseline.snoozed + 1} snoozed`);
  });
});
