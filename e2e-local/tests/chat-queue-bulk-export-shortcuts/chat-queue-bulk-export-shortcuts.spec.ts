import { expect, test } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedBulkChatCards, type SeededBulkChat } from './seed-bulk-chat-cards';

test.describe('chat queue bulk move, shortcuts help and export', () => {
  let seeded: SeededBulkChat;

  test.beforeEach(async () => {
    seeded = await seedBulkChatCards();
  });

  test.afterEach(async () => {
    await seeded?.cleanup();
  });

  test('should ask for confirmation before moving more than five selected cards to Inbox', async ({ page }) => {
    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('chat-queue-search').fill(seeded.runId);

    for (const card of seeded.cards) {
      await expect(page.getByTestId(`chat-queue-row-${card.id}`)).toBeVisible();
      await page.getByTestId(`chat-queue-select-${card.id}`).check();
    }

    await expect(page.getByTestId('chat-queue-bulk-count')).toHaveText('6 selected');
    await page.getByTestId('chat-queue-bulk-move').click();
    await expect(page.getByTestId('chat-queue-bulk-confirm-text')).toHaveText('Move 6 cards to Inbox?');

    await page.getByTestId('chat-queue-bulk-cancel').click();
    await expect(page.getByTestId('chat-queue-bulk-confirm-text')).toHaveCount(0);
    await expect(page.getByTestId(`chat-queue-row-${seeded.cards[0]!.id}`)).toBeVisible();

    await page.getByTestId('chat-queue-bulk-move').click();
    await page.getByTestId('chat-queue-bulk-confirm').click();

    for (const card of seeded.cards) {
      await expect(page.getByTestId(`chat-queue-row-${card.id}`)).toHaveCount(0);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('chat-queue-empty')).toBeVisible();
  });

  test('should open the shortcuts dialog with ? and close it with Escape', async ({ page }) => {
    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('chat-queue-list')).toBeVisible();

    await page.keyboard.press('?');

    const dialog = page.getByTestId('chat-queue-shortcuts-dialog');

    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('should download the subject export named after the subject', async ({ page }) => {
    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`chat-queue-row-${seeded.cards[0]!.id}`)).toBeVisible();
    await expect(page.getByTestId('chat-queue-export')).toBeDisabled();

    await page.getByTestId('chat-queue-subject').selectOption(seeded.subjectName);
    await expect(page.getByTestId('chat-queue-export')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');

    await page.getByTestId('chat-queue-export').click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^chat-.*\.md$/);
    expect(download.suggestedFilename().toLowerCase()).toContain(seeded.runId);
  });
});
