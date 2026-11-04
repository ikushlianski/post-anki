import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededHeaderCard {
  id: string;
  body: string;
  ageDays: number;
}

export interface SeededHeaderCounts {
  cards: SeededHeaderCard[];
  baseline: { waiting: number; snoozed: number };
  cleanup: () => Promise<void>;
}

const AGES_DAYS = [5, 2, 0];

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

export async function seedHeaderCountsCards(): Promise<SeededHeaderCounts> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const subjectId = `subj-${runId}-hc`;
  const sourceId = `src-${runId}-hc`;
  const cards = AGES_DAYS.map((ageDays, ordinal) => ({
    id: `bit-${runId}-hc${ordinal}`,
    body: `HeaderCounts ${runId} card ${ordinal}`,
    ageDays,
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
    const counts = await client.query<{ waiting: string; snoozed: string }>(
      `SELECT count(*) FILTER (WHERE chat_snoozed_until IS NULL OR chat_snoozed_until <= now()) AS waiting,
              count(*) FILTER (WHERE chat_snoozed_until > now()) AS snoozed
       FROM knowledge_bits WHERE approval_state = 'chat'`,
    );
    const baseline = {
      waiting: Number(counts.rows[0]?.waiting ?? 0),
      snoozed: Number(counts.rows[0]?.snoozed ?? 0),
    };

    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Header Counts ${runId}`]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );

    for (const [ordinal, card] of cards.entries()) {
      await client.query(
        "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at) VALUES ($1, $2, $3, $4, 'chat', now() - ($5 || ' days')::interval)",
        [card.id, sourceId, ordinal, card.body, String(card.ageDays)],
      );
    }

    return { cards, baseline, cleanup };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
