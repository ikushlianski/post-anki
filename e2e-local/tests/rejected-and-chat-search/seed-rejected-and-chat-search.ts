import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededRejectedAndChat {
  runId: string;
  rejectedCards: { id: string; body: string }[];
  chatCard: { id: string; body: string };
  uniqueWord: string;
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

export async function seedRejectedAndChat(): Promise<SeededRejectedAndChat> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const uniqueWord = `zyx${runId}quokka`;
  const subjectId = `subj-${runId}-rc`;
  const sourceId = `src-${runId}-rc`;
  const client = new pg.Client({ connectionString: url });

  await client.connect();
  await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Rejected Chat ${runId}`]);
  await client.query(
    "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
    [sourceId, `raw ${runId}`, subjectId],
  );

  const rejectedCards: { id: string; body: string }[] = [];

  for (let ordinal = 0; ordinal < 3; ordinal += 1) {
    const id = `bit-${runId}-rej-${ordinal}`;
    const body = `Rejected card ${ordinal} about lysosomes ${runId}`;

    await client.query(
      "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, 'rejected')",
      [id, sourceId, ordinal, body],
    );
    await client.query(
      "INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index) VALUES ($1, $2, $3, 'rejected', 'unspecified', $4)",
      [`dec-${runId}-${ordinal}`, `sess-${runId}`, id, ordinal],
    );
    rejectedCards.push({ id, body });
  }

  const chatCard = { id: `bit-${runId}-chat`, body: `Golgi apparatus packages proteins ${runId}` };

  await client.query(
    "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at) VALUES ($1, $2, 10, $3, 'chat', now())",
    [chatCard.id, sourceId, chatCard.body],
  );
  await client.query(
    "INSERT INTO knowledge_bit_chat_messages (id, knowledge_bit_id, seq, role, text) VALUES ($1, $2, 1, 'user', $3)",
    [`msg-${runId}-1`, chatCard.id, `Why is the ${uniqueWord} relevant here?`],
  );

  return {
    runId,
    rejectedCards,
    chatCard,
    uniqueWord,
    cleanup: async () => {
      const ids = [...rejectedCards.map((card) => card.id), chatCard.id];

      await client.query('DELETE FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = ANY($1)', [ids]);
      await client.query('DELETE FROM card_triage_decisions WHERE knowledge_bit_id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_bits WHERE id = ANY($1)', [ids]);
      await client.query('DELETE FROM knowledge_sources WHERE id = $1', [sourceId]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
      await client.end();
    },
  };
}
