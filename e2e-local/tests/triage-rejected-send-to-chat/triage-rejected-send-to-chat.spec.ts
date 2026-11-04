import { expect, test } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedRejectedToChat, type SeededRejectedToChat } from './seed-rejected-to-chat';

test.describe('triage rejected decision sent to Chat', () => {
  let seeded: SeededRejectedToChat;

  test.beforeAll(async () => {
    seeded = await seedRejectedToChat();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should send a rejected decision to Chat from the decisions list and show it in the Chat queue', async ({
    page,
  }) => {
    const { card } = seeded;

    await page.goto('/knowledge-bit-review', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('triage-start').click();
    await expect(page.getByTestId(`knowledge-bit-focus-card-${card.id}`)).toBeVisible();

    await page.keyboard.press('x');
    await expect(page.getByTestId(`knowledge-bit-focus-card-${card.id}`)).toHaveCount(0);

    await page.keyboard.press('f');

    const decision = page.getByTestId(`triage-decision-${card.id}`);

    await expect(decision).toBeVisible();
    await page.getByTestId(`triage-decision-send-chat-${card.id}`).click();
    await expect(page.getByTestId(`triage-decision-in-chat-${card.id}`)).toHaveText('Sent to Chat');

    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`chat-queue-row-${card.id}`)).toContainText(card.body);

    await page.goto('/knowledge/rejected', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`rejected-card-row-${card.id}`)).toHaveCount(0);
  });
});
