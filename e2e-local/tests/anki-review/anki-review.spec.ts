import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedReviewCard, type SeededReviewCard } from './seed-review-card';

async function openReview(page: Page, bitId: string): Promise<void> {
  await page.goto(`/knowledge/review?knowledgeBitId=${bitId}`, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await expect(page.getByTestId('anki-review-card')).toBeVisible();
}

test.describe('Anki review shortcuts', () => {
  let seeded: SeededReviewCard;

  test.beforeEach(async () => {
    seeded = await seedReviewCard();
  });

  test.afterEach(async () => {
    await seeded?.cleanup();
  });

  test('should open and close the shortcut help with question mark and escape', async ({ page }) => {
    await openReview(page, seeded.bitId);
    await expect(page.getByTestId('anki-review-prompt')).toContainText(seeded.prompt);

    await page.keyboard.press('?');
    await expect(page.getByTestId('anki-review-shortcuts-dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('anki-review-shortcuts-dialog')).toBeHidden();
  });

  test('should reveal the answer with space and grade with a number key and finish the session on the done screen', async ({
    page,
  }) => {
    await openReview(page, seeded.bitId);

    await page.keyboard.press('Space');
    await expect(page.getByTestId('anki-review-answer')).toContainText(seeded.answer);
    await expect(page.getByTestId('anki-review-grades')).toBeVisible();

    await page.keyboard.press('3');
    await expect(page.getByTestId('anki-review-progress')).toContainText('1 reviewed');

    await page.getByRole('button', { name: /Suspend/ }).click();

    await expect(page.getByTestId('anki-review-done')).toBeVisible();
    await expect(page.getByTestId('anki-review-done')).toContainText('Done for today');
    await expect(page.getByTestId('anki-review-done')).toContainText('1 card reviewed today');
  });

  test('should show the page name and a due count prefix in the tab title', async ({ page }) => {
    await openReview(page, seeded.bitId);

    await expect(page).toHaveTitle(/^\(\d+\) .+ · Post Anki$/);
  });
});
