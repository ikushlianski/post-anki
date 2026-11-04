import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededTriageKeys {
  runId: string;
  chatCard: { id: string; body: string };
  inboxCard: { id: string; body: string };
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

export async function seedTriageKeysCards(): Promise<SeededTriageKeys> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const subjectId = `subj-${runId}-tk`;
  const sourceId = `src-${runId}-tk`;
  const chatCard = { id: `bit-${runId}-c`, body: `Mitochondria produce ATP ${runId}` };
  const inboxCard = { id: `bit-${runId}-i`, body: `Ribosomes assemble proteins ${runId}` };
  const ids = [chatCard.id, inboxCard.id];
  const client = new pg.Client({ connectionString: url });

  await client.connect();

  let existingSessionIds: string[] = [];
  let snapshotTaken = false;

  const cleanup = async (): Promise<void> => {
    try {
      if (snapshotTaken) {
        await client.query(
          'DELETE FROM card_style_notes WHERE session_id IN (SELECT id FROM card_triage_sessions WHERE id <> ALL($1) AND (id IN (SELECT session_id FROM card_triage_decisions WHERE knowledge_bit_id = ANY($2)) OR id NOT IN (SELECT session_id FROM card_triage_decisions)))',
          [existingSessionIds, ids],
        );
      }

      await client.query('DELETE FROM card_triage_decisions WHERE knowledge_bit_id = ANY($1)', [ids]);

      if (snapshotTaken) {
        await client.query(
          'DELETE FROM card_triage_sessions WHERE id <> ALL($1) AND id NOT IN (SELECT session_id FROM card_triage_decisions)',
          [existingSessionIds],
        );
      }

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
    const existing = await client.query<{ id: string }>('SELECT id FROM card_triage_sessions');

    existingSessionIds = existing.rows.map((row) => row.id);
    snapshotTaken = true;

    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Triage Keys ${runId}`]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );

    for (const [ordinal, card] of [chatCard, inboxCard].entries()) {
      await client.query(
        "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at) VALUES ($1, $2, $3, $4, 'pending', now() - ($5 || ' days')::interval)",
        [card.id, sourceId, ordinal, card.body, String(3650 - ordinal)],
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

  return { runId, chatCard, inboxCard, cleanup };
}
