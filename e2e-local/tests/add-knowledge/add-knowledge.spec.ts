import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedSubject, type SeededSubject } from './seed-subject';

const DRAFT_KEY = 'post-anki:add-knowledge:draft-blocks';

async function openForm(page: Page, subjectId: string): Promise<void> {
  await page.goto(`/add-knowledge?subjectId=${subjectId}`, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await expect(page.getByTestId('knowledge-add-form')).toBeVisible();
}

test.describe('Add knowledge', () => {
  let seeded: SeededSubject;

  test.beforeAll(async () => {
    seeded = await seedSubject();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('e2e-draft-reset')) {
        sessionStorage.setItem('e2e-draft-reset', '1');
        localStorage.removeItem(key);
      }
    }, DRAFT_KEY);
  });

  test('should have no accessibility violations on the form', async ({ page }) => {
    await openForm(page, seeded.subjectId);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('should keep a typed draft after a reload and clear it after a successful submit', async ({ page }) => {
    const text = `Draft survives reload ${Date.now()}: the mitochondria is the powerhouse of the cell.`;

    await openForm(page, seeded.subjectId);
    await page.getByTestId('knowledge-block-input-0').fill(text);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toContain('Draft survives reload');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('knowledge-block-input-0')).toHaveValue(text);

    await page.getByTestId('knowledge-submit-button').click();
    await expect(page.getByTestId('knowledge-success-message')).toBeVisible();
    await expect(page.getByTestId('knowledge-block-input-0')).toHaveValue('');
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('knowledge-block-input-0')).toHaveValue('');
  });

  test('should announce a non-http link and keep submit disabled', async ({ page }) => {
    await openForm(page, seeded.subjectId);
    await page.getByTestId('knowledge-block-type-url-0').click();
    await page.getByTestId('knowledge-block-input-0').fill('ftp://example.com/file.txt');

    const alert = page.getByTestId('knowledge-block-link-error-0');

    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('knowledge-submit-button')).toBeDisabled();

    await page.getByTestId('knowledge-block-input-0').fill('https://example.com/article');
    await expect(alert).toHaveCount(0);
    await expect(page.getByTestId('knowledge-submit-button')).toBeEnabled();
  });

  test('should submit with the keyboard shortcut and offer the review link', async ({ page }) => {
    await openForm(page, seeded.subjectId);
    await page.getByTestId('knowledge-block-input-0').fill(`Keyboard submit ${Date.now()}: ribosomes build proteins.`);
    await page.getByTestId('knowledge-block-input-0').press('ControlOrMeta+Enter');

    await expect(page.getByTestId('knowledge-success-message')).toBeVisible();
    await expect(page.getByTestId('knowledge-success-review-link')).toBeVisible();
    await page.getByTestId('knowledge-success-review-link').click();
    await expect(page).toHaveURL(/\/knowledge-bit-review/);
  });
});
