import { randomUUID } from 'node:crypto';

import pg from 'pg';

export interface SeededStatsRejectReasons {
  runId: string;
  reasonCounts: Record<string, number>;
  nothingExtracted: { processed: number; nothingExtracted: number };
  cleanup: () => Promise<void>;
}

const SEEDED_REASONS = ['wrong_language', 'wrong_language', 'bad_format'] as const;

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

export async function seedStatsRejectReasons(): Promise<SeededStatsRejectReasons> {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (source e2e/.env)');
  }

  assertIsolatedDatabase(url);

  const runId = randomUUID().slice(0, 8);
  const subjectId = `subj-${runId}-st`;
  const sourceId = `src-${runId}-st`;
  const emptySourceIds = [`src-${runId}-st-e0`, `src-${runId}-st-e1`];
  const bitIds = SEEDED_REASONS.map((_, index) => `bit-${runId}-st-${index}`);
  const client = new pg.Client({ connectionString: url });

  await client.connect();

  const cleanup = async (): Promise<void> => {
    try {
      await client.query('DELETE FROM card_triage_decisions WHERE knowledge_bit_id = ANY($1)', [bitIds]);
      await client.query('DELETE FROM knowledge_bits WHERE id = ANY($1)', [bitIds]);
      await client.query('DELETE FROM knowledge_sources WHERE id = ANY($1)', [[sourceId, ...emptySourceIds]]);
      await client.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    } finally {
      await client.end();
    }
  };

  try {
    await client.query('INSERT INTO subjects (id, name) VALUES ($1, $2)', [subjectId, `Stats Reasons ${runId}`]);
    await client.query(
      "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'text', $2, 'detected', $3)",
      [sourceId, `raw ${runId}`, subjectId],
    );

    for (const [index, reason] of SEEDED_REASONS.entries()) {
      await client.query(
        "INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, 'rejected')",
        [bitIds[index], sourceId, index, `Stats rejected card ${index} ${runId}`],
      );
      await client.query(
        "INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index) VALUES ($1, $2, $3, 'rejected', $4, $5)",
        [`dec-${runId}-st-${index}`, `sess-${runId}-st`, bitIds[index], reason, index],
      );
    }

    for (const id of emptySourceIds) {
      await client.query(
        "INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, nothing_extracted_at) VALUES ($1, 'text', $2, 'bits_detected', $3, now())",
        [id, `empty ${runId}`, subjectId],
      );
    }
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  const reasons = await client.query<{ reasonCode: string; count: number }>(
    `select reason_code as "reasonCode", count(*)::int as "count" from (
       select reason_code from card_triage_decisions where verdict = 'rejected' and undone_at is null
       union all
       select reason_code from knowledge_bit_feedback
       where verdict = 'rejected'
         and id not in (select feedback_id from card_triage_decisions where feedback_id is not null)
     ) rejected group by reason_code`,
  );
  const reasonCounts = Object.fromEntries(reasons.rows.map((row) => [row.reasonCode, row.count]));

  const week = await client.query<{ processed: number; nothingExtracted: number }>(
    `select count(*)::int as "processed", (count(*) filter (where nothing_extracted_at is not null))::int as "nothingExtracted"
     from knowledge_sources
     where status = 'bits_detected'
       and date_trunc('week', coalesce(nothing_extracted_at, updated_at) at time zone 'UTC') =
           date_trunc('week', now() at time zone 'UTC')`,
  );

  return { runId, reasonCounts, nothingExtracted: week.rows[0]!, cleanup };
}
