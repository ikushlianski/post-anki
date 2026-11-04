import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { waitForHydration } from '../../lib/wait-for-hydration';
import { seedChatQueueCards, type SeededChatQueue } from '../chat-queue/seed-chat-queue-cards';

const PINNED_REPLY = 'Pinned reply from the e2e mock model.';
const MOCK_URL = `http://127.0.0.1:${process.env.E2E_MOCK_LLM_PORT ?? '4999'}`;

async function pinReply(text: string | null): Promise<void> {
  const response = await fetch(`${MOCK_URL}/_mock/set-text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error('mock has no /_mock/set-text; start the stack with E2E_MOCK_KIND=local scripts/e2e-stack.sh up');
  }
}

async function openThread(page: Page, card: { id: string; body: string }) {
  await page.goto('/knowledge/chat', { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await page.getByTestId(`chat-queue-row-${card.id}`).click();
  await expect(page.getByTestId('chat-queue-thread')).toContainText(card.body);
}

test.describe('chat queue thread reply', () => {
  let seeded: SeededChatQueue;

  test.beforeAll(async () => {
    seeded = await seedChatQueueCards();
  });

  test.afterAll(async () => {
    await pinReply(null).catch(() => undefined);
    await seeded?.cleanup();
  });

  test('should show the pinned model reply after sending a message in a thread', async ({ page }) => {
    const question = 'Why does this matter in practice?';

    await pinReply(PINNED_REPLY);
    await openThread(page, seeded.cards[0]!);
    await page.getByRole('textbox', { name: 'Ask about this card' }).fill(question);
    await page.getByTestId('chat-queue-send').click();

    const lines = page.getByTestId('chat-queue-lines');

    await expect(lines).toContainText(question);
    await expect(lines).toContainText(PINNED_REPLY);
    await expect(page.getByTestId('chat-queue-error')).toHaveCount(0);
  });

  test('should show the paused message instead of the composer when the daily AI budget is used up', async ({
    page,
  }) => {
    const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });

    await client.connect();

    const day = new Date().toISOString().slice(0, 10);
    const before = await client.query<{ spent_usd: string }>('SELECT spent_usd FROM llm_daily_spend WHERE day = $1', [day]);

    await client.query(
      `INSERT INTO llm_daily_spend (day, spent_usd) VALUES ($1, 100000)
       ON CONFLICT (day) DO UPDATE SET spent_usd = 100000, updated_at = now()`,
      [day],
    );

    try {
      await openThread(page, seeded.cards[1]!);
      await page.getByRole('textbox', { name: 'Ask about this card' }).fill('Is this still allowed?');
      await page.getByTestId('chat-queue-send').click();
      await expect(page.getByTestId('chat-queue-paused')).toHaveText('Chat is paused for today');
      await expect(page.getByRole('textbox', { name: 'Ask about this card' })).toHaveCount(0);
    } finally {
      if (before.rows[0]) {
        await client.query('UPDATE llm_daily_spend SET spent_usd = $2, updated_at = now() WHERE day = $1', [
          day,
          before.rows[0].spent_usd,
        ]);
      } else {
        await client.query('DELETE FROM llm_daily_spend WHERE day = $1', [day]);
      }

      await client.end();
    }
  });
});
