import { expect, test } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedTriageKeysCards, type SeededTriageKeys } from './seed-triage-keys-cards';

test.describe('triage chat and inbox keys smoke', () => {
  let seeded: SeededTriageKeys;

  test.beforeAll(async () => {
    seeded = await seedTriageKeysCards();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should send the current card to Chat on C and the next to Inbox on I', async ({ page }) => {
    const { chatCard, inboxCard } = seeded;

    await page.goto('/knowledge-bit-review', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('triage-start').click();

    const progress = page.getByTestId('knowledge-bit-focus-progress');

    await expect(page.getByTestId(`knowledge-bit-focus-card-${chatCard.id}`)).toBeVisible();
    await expect(progress).toContainText(/\d+ to review/);

    const startingCount = Number(/(\d+) to review/.exec((await progress.textContent()) ?? '')?.[1]);

    expect(startingCount).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('c');
    await expect(page.getByTestId(`knowledge-bit-focus-card-${inboxCard.id}`)).toBeVisible();
    await expect(page.getByTestId(`knowledge-bit-focus-card-${chatCard.id}`)).toHaveCount(0);
    await expect(progress).toContainText(`${startingCount - 1} to review`);

    await page.keyboard.press('i');
    await expect(page.getByTestId(`knowledge-bit-focus-card-${inboxCard.id}`)).toHaveCount(0);

    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`chat-queue-row-${chatCard.id}`)).toContainText(chatCard.body);
    await expect(page.getByTestId(`chat-queue-row-${inboxCard.id}`)).toHaveCount(0);

    await page.goto('/knowledge/inbox', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${inboxCard.id}`)).toContainText(inboxCard.body);
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${chatCard.id}`)).toHaveCount(0);
  });
});
