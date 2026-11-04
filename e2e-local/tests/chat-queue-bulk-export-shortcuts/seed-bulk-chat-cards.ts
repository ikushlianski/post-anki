import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededBulkChat {
  runId: string;
  subjectName: string;
  cards: { id: string; body: string }[];
  cleanup: () => Promise<void>;
}

const CARD_COUNT = 6;

function assertIsolatedDatabase(url: string): void {
  const parsed = new URL(url);
  const isolated =
    ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
    parsed.port === '5578' &&
    parsed.pathname === '/postanki_e2e';

  if (!isolated) {
    throw new Error('seed refused: E2E_DATABASE_URL must be the isolated e2e database on port 5578');
  }
}

export async function seedBulkChatCards(): Promise<SeededBulkChat> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const subjectName = `Bulk Chat ${runId}`;
  const subjectId = `subj-${runId}-bk`;
  const sourceId = `src-${runId}-bk`;
  const cards = Array.from({ length: CARD_COUNT }, (_, index) => ({
    id: `bit-${runId}-bk-${index}`,
    body: `Bulk chat card ${index} about enzymes ${runId}`,
  }));
  const ids = cards.map((card) => card.id);
  const client = new pg.Client({ connectionString: url });

  await client.connect();

  const cleanup = async (): Promise<void> => {
    try {
      await client.query('DELETE FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_bits WHERE id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_sources WHERE id = $1', [sourceId]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    } finally {
      await client.end();
    }
  };

  try {
    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, subjectName]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );

    for (const [ordinal, card] of cards.entries()) {
      await client.query(
        "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at) VALUES ($1, $2, $3, $4, 'chat', now() - ($5 || ' minutes')::interval)",
        [card.id, sourceId, ordinal, card.body, String(ordinal)],
      );
    }
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  return { runId, subjectName, cards, cleanup };
}
