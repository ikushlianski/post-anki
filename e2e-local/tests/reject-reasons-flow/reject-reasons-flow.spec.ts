import { expect, test } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedRejectedToChat, type SeededRejectedToChat } from '../triage-rejected-send-to-chat/seed-rejected-to-chat';

const CHOSEN = 'wrong_language';
const OTHER = 'bad_format';

test.describe('reject reasons flow', () => {
  let seeded: SeededRejectedToChat;

  test.beforeAll(async () => {
    seeded = await seedRejectedToChat();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should show the reason chosen in triage on Rejected and filter by its chip', async ({ page }) => {
    const { card } = seeded;

    await page.goto('/knowledge-bit-review', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('triage-start').click();
    await expect(page.getByTestId(`knowledge-bit-focus-card-${card.id}`)).toBeVisible();

    await expect(page.getByTestId('knowledge-bit-focus-progress')).toContainText(/\d+ to review/);
    await page.keyboard.press('x');
    await expect(page.getByTestId(`knowledge-bit-focus-card-${card.id}`)).toHaveCount(0);

    await page.keyboard.press('f');

    const reasonChip = page.getByTestId(`triage-decision-reason-${card.id}-${CHOSEN}`);

    await reasonChip.click();
    await expect(reasonChip).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('knowledge-bit-focus-finish').click();
    await page.getByTestId('triage-feedback-skip').click();
    await expect(page.getByTestId('triage-feedback-panel')).toHaveCount(0);

    await page.goto('/knowledge/rejected', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('rejected-cards-search').fill(seeded.runId);

    const row = page.getByTestId(`rejected-card-row-${card.id}`);

    await expect(row).toContainText(card.body);
    await expect(page.getByTestId(`rejected-card-reason-${card.id}`)).toHaveText('Wrong language');

    await page.getByTestId(`rejected-cards-chip-${OTHER}`).click();
    await expect(page.getByTestId(`rejected-cards-chip-${OTHER}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toHaveCount(0);

    await page.getByTestId(`rejected-cards-chip-${CHOSEN}`).click();
    await expect(page.getByTestId(`rejected-cards-chip-${CHOSEN}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toBeVisible();
  });
});
