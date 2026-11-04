import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedRejectedAndChat, type SeededRejectedAndChat } from './seed-rejected-and-chat-search';

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
}

test.describe('rejected cards restore and chat message search smoke', () => {
  let seeded: SeededRejectedAndChat;

  test.beforeAll(async () => {
    seeded = await seedRejectedAndChat();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should have no accessibility violations on the rejected page with rows', async ({ page }) => {
    await page.goto('/knowledge/rejected', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('rejected-cards-search').fill(seeded.runId);

    const rows = page.getByTestId(/^rejected-card-row-/);

    await expect(rows.first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('should drop restored cards from the rejected list, singly and in bulk', async ({ page }) => {
    const [single, bulkA, bulkB] = seeded.rejectedCards;

    await page.goto('/knowledge/rejected', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('rejected-cards-search').fill(seeded.runId);

    for (const card of seeded.rejectedCards) {
      await expect(page.getByTestId(`rejected-card-row-${card.id}`)).toContainText(card.body);
    }

    await page.getByTestId(`rejected-card-restore-${single!.id}`).click();
    await expect(page.getByTestId(`rejected-card-row-${single!.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`rejected-card-row-${bulkA!.id}`)).toBeVisible();

    await page.getByTestId(`rejected-card-select-${bulkA!.id}`).check();
    await page.getByTestId(`rejected-card-select-${bulkB!.id}`).check();
    await expect(page.getByTestId('rejected-cards-restore-selected')).toContainText('(2)');
    await page.getByTestId('rejected-cards-restore-selected').click();
    await expect(page.getByTestId(`rejected-card-row-${bulkA!.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`rejected-card-row-${bulkB!.id}`)).toHaveCount(0);
    await expect(page.getByTestId('rejected-cards-empty')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('rejected-cards-search').fill(seeded.runId);
    await expect(page.getByTestId('rejected-cards-empty')).toBeVisible();
  });

  test('should find a chat message by a unique word and open its thread', async ({ page }) => {
    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('chat-queue-message-search-input').fill(seeded.uniqueWord);

    const hit = page.getByTestId(`chat-queue-message-hit-${seeded.chatCard.id}-1`);

    await expect(hit).toBeVisible();
    await expect(hit).toContainText(seeded.uniqueWord);
    await hit.click();
    await expect(page.getByTestId('chat-queue-thread')).toBeVisible();
    await expect(page.getByTestId('chat-queue-thread')).toContainText(seeded.chatCard.body);
  });

  test('should have no accessibility violations on chat search results', async ({ page }) => {
    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('chat-queue-message-search-input').fill(seeded.uniqueWord);
    await expect(page.getByTestId(`chat-queue-message-hit-${seeded.chatCard.id}-1`)).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
