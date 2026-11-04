import { randomUUID } from 'node:crypto';

import { connectIsolatedDb } from '../../lib/connect-isolated-db';

export interface SeededReviewCard {
  bitId: string;
  prompt: string;
  answer: string;
  cleanup: () => Promise<void>;
}

export async function seedReviewCard(): Promise<SeededReviewCard> {
  const runId = randomUUID().slice(0, 8);
  const subjectId = `subj-${runId}-rev`;
  const sourceId = `src-${runId}-rev`;
  const bitId = `bit-${runId}-rev`;
  const prompt = `Which organelle makes ATP ${runId}?`;
  const answer = `Mitochondria ${runId}`;
  const client = await connectIsolatedDb();

  const cleanup = async (): Promise<void> => {
    try {
      await client.query('DELETE FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1', [bitId]);
      await client.query('DELETE FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = $1', [bitId]);
      await client.query('DELETE FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1', [bitId]);
      await client.query('DELETE FROM knowledge_bits WHERE id = $1', [bitId]);
      await client.query('DELETE FROM knowledge_sources WHERE id = $1', [sourceId]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    } finally {
      await client.end();
    }
  };

  try {
    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Review ${runId}`]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );
    await client.query(
      "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, 'approved')",
      [bitId, sourceId, answer],
    );
    await client.query(
      "INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, \"order\", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, $4)",
      [`var-${bitId}`, bitId, prompt, answer],
    );
    await client.query(
      "INSERT INTO knowledge_bit_schedules (knowledge_bit_id, card_key, interval_days, due_at, last_reviewed_at, review_count, phase) VALUES ($1, '', 3, now() - interval '1 hour', now() - interval '3 days', 2, 'review')",
      [bitId],
    );
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  return { bitId, prompt, answer, cleanup };
}
