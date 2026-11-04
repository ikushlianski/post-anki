import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedChatQueueCards, type SeededChatQueue } from './seed-chat-queue-cards';

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) }));
}

test.describe('chat queue page smoke', () => {
  let seeded: SeededChatQueue;

  test.beforeAll(async () => {
    seeded = await seedChatQueueCards();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test('should list, filter, snooze and open a thread without calling the model', async ({ page }) => {
    const [first, second, third] = seeded.cards;
    const [firstSubject, secondSubject] = seeded.subjectNames;

    await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(page.getByTestId('chat-queue-list')).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${first!.id}`)).toContainText(first!.body);
    await expect(page.getByTestId(`chat-queue-row-${second!.id}`)).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${third!.id}`)).toBeVisible();

    const count = page.getByTestId('chat-queue-count');
    expect(await seriousViolations(page)).toEqual([]);

    const total = Number((await count.innerText()).match(/of (\d+)/)?.[1]);

    expect(total).toBeGreaterThanOrEqual(3);

    await page.getByTestId('chat-queue-search').fill('Westphalia');
    await expect(page.getByTestId(`chat-queue-row-${third!.id}`)).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${first!.id}`)).toHaveCount(0);
    await expect(count).toHaveText(`1 of ${total}`);

    await page.getByTestId('chat-queue-search').fill('');
    await page.getByTestId('chat-queue-subject').selectOption(firstSubject);
    await expect(page.getByTestId(`chat-queue-row-${first!.id}`)).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${second!.id}`)).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${third!.id}`)).toHaveCount(0);
    await expect(count).toHaveText(`2 of ${total}`);

    await page.getByTestId('chat-queue-subject').selectOption(secondSubject);
    await expect(page.getByTestId(`chat-queue-row-${third!.id}`)).toBeVisible();
    await expect(page.getByTestId(`chat-queue-row-${first!.id}`)).toHaveCount(0);

    await page.getByTestId('chat-queue-subject').selectOption('');

    await page.getByTestId(`chat-queue-snooze-${first!.id}`).selectOption('1');
    await expect(page.getByTestId(`chat-queue-snoozed-${first!.id}`)).toContainText('Snoozed until');

    await page.getByTestId(`chat-queue-row-${second!.id}`).click();
    await expect(page.getByTestId('chat-queue-thread')).toBeVisible();
    await expect(page.getByTestId('chat-queue-thread')).toContainText(second!.body);
    await expect(page.getByRole('textbox', { name: 'Ask about this card' })).toBeVisible();
    await expect(page.getByTestId('chat-queue-send')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
