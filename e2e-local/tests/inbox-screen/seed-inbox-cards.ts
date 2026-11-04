import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededInbox {
  runId: string;
  cards: { id: string; body: string }[];
  matchingWord: string;
  cleanup: () => Promise<void>;
}

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

export async function seedInboxCards(): Promise<SeededInbox> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const matchingWord = `zyx${runId}axolotl`;
  const subjectId = `subj-${runId}-inb`;
  const sourceId = `src-${runId}-inb`;
  const bodies = [
    `Mitochondria produce ATP ${runId} ${matchingWord}`,
    `Ribosomes assemble proteins ${runId}`,
    `Nucleoli build ribosomes ${runId}`,
  ];
  const cards = bodies.map((body, index) => ({ id: `bit-${runId}-inb-${index}`, body }));
  const ids = cards.map((card) => card.id);
  const client = new pg.Client({ connectionString: url });

  await client.connect();

  const cleanup = async (): Promise<void> => {
    try {
      await client.query('DELETE FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_bit_question_variants WHERE knowledge_bit_id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_bits WHERE id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_sources WHERE id = $1', [sourceId]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    } finally {
      await client.end();
    }
  };

  try {
    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Inbox Screen ${runId}`]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );

    for (const [ordinal, card] of cards.entries()) {
      await client.query(
        "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, inbox_at) VALUES ($1, $2, $3, $4, 'inbox', now())",
        [card.id, sourceId, ordinal, card.body],
      );
      await client.query(
        "INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, \"order\", prompt, answer) VALUES ($1, $2, 'qa', 0, $3, $4)",
        [`var-${card.id}`, card.id, `What is true? ${card.body}`, card.body],
      );
    }
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  return { runId, cards, matchingWord, cleanup };
}
