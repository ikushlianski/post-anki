import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedInboxCards, type SeededInbox } from './seed-inbox-cards';

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
}

test.describe('Inbox screen', () => {
  let seeded: SeededInbox;

  test.beforeAll(async () => {
    seeded = await seedInboxCards();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should have no accessibility violations on the Inbox with rows', async ({ page }) => {
    await page.goto('/knowledge/inbox', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${seeded.cards[0]!.id}`)).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('should narrow the Inbox to cards matching the text filter and restore all on clear', async ({ page }) => {
    const [match, other] = seeded.cards;

    await page.goto('/knowledge/inbox', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${other!.id}`)).toBeVisible();
    await page.getByTestId('knowledge-bit-inbox-search').fill(seeded.matchingWord);
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${match!.id}`)).toBeVisible();
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${other!.id}`)).toHaveCount(0);

    await page.getByTestId('knowledge-bit-inbox-search').fill(`nomatch${seeded.runId}`);
    await expect(page.getByTestId('knowledge-bit-inbox-no-matches')).toBeVisible();

    await page.getByTestId('knowledge-bit-inbox-clear-filters').click();
    await expect(page.getByTestId(`knowledge-bit-inbox-row-${other!.id}`)).toBeVisible();
  });

  test('should move an Inbox card to Chat with Send to Chat', async ({ page }) => {
    const card = seeded.cards[2]!;

    await page.goto('/knowledge/inbox', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const row = page.getByTestId(`knowledge-bit-inbox-row-${card.id}`);

    await expect(row).toContainText(card.body);
    await page.getByTestId(`knowledge-bit-inbox-chat-${card.id}`).click();
    await expect(row).toHaveCount(0);

    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId(`chat-queue-row-${card.id}`)).toContainText(card.body);
  });
});
