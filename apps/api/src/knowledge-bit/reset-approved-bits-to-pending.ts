import { assertLocalOrConfirmed } from "../db/assert-local-or-confirmed.js";

export type SqlClient = {
  query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type ApprovalCounts = Record<string, number>;

export type ResetSummary = {
  host: string;
  database: string;
  before: ApprovalCounts;
  after: ApprovalCounts;
  bitsReset: number;
  sourcesReopened: number;
};

async function countByState(client: SqlClient): Promise<ApprovalCounts> {
  const { rows } = await client.query(
    "SELECT approval_state, count(*)::int AS n FROM knowledge_bits GROUP BY approval_state",
  );

  return Object.fromEntries(rows.map((row) => [String(row.approval_state), Number(row.n)]));
}

export async function resetApprovedBitsToPending(
  client: SqlClient,
  databaseUrl: string | undefined,
): Promise<ResetSummary> {
  const host = assertLocalOrConfirmed(databaseUrl, {});
  const database = new URL(databaseUrl as string).pathname.replace(/^\//, "");
  const before = await countByState(client);

  await client.query("BEGIN");

  try {
    const reopened = await client.query(
      `UPDATE knowledge_sources SET processed_at = NULL
       WHERE processed_at IS NOT NULL
         AND id IN (SELECT knowledge_source_id FROM knowledge_bits WHERE approval_state = 'approved')
       RETURNING id`,
    );
    const updated = await client.query(
      "UPDATE knowledge_bits SET approval_state = 'pending' WHERE approval_state = 'approved' RETURNING id",
    );

    await client.query("COMMIT");

    return {
      host,
      database,
      before,
      after: await countByState(client),
      bitsReset: updated.rows.length,
      sourcesReopened: reopened.rows.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");

    throw err;
  }
}
