import { randomUUID } from 'node:crypto';

import { connectIsolatedDb } from '../../lib/connect-isolated-db';

export interface SeededSubject {
  subjectId: string;
  cleanup: () => Promise<void>;
}

export async function seedSubject(): Promise<SeededSubject> {
  const runId = randomUUID().slice(0, 8);
  const subjectId = `subj-${runId}-add`;
  const client = await connectIsolatedDb();

  await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Add Knowledge ${runId}`]);

  const cleanup = async (): Promise<void> => {
    try {
      const sources = await client.query('SELECT id FROM knowledge_sources WHERE subject_id = $1', [subjectId]);
      const sourceIds = sources.rows.map((row: { id: string }) => row.id);
      const bits = await client.query('SELECT id FROM knowledge_bits WHERE knowledge_source_id = ANY($1)', [sourceIds]);
      const bitIds = bits.rows.map((row: { id: string }) => row.id);

      await client.query('DELETE FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = ANY($1)', [bitIds]);
      await client.query('DELETE FROM knowledge_bit_question_variants WHERE knowledge_bit_id = ANY($1)', [bitIds]);
      await client.query('DELETE FROM knowledge_bits WHERE id = ANY($1)', [bitIds]);
      await client.query('DELETE FROM knowledge_sources WHERE id = ANY($1)', [sourceIds]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    } finally {
      await client.end();
    }
  };

  return { subjectId, cleanup };
}
