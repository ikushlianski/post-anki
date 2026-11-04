import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { DURABLE_OWNER_PREFIX, durableStaleMs } from "./durable-extraction.config.js";
import type { KnowledgeSourceClaimToken } from "./knowledge-bit-read.repo.js";

// Atomically marks the source as owned by a durable workflow. Uses the
// `updatedAt` value from the token as a CAS guard so a concurrent reclaim
// (e.g. stale-reset) cannot be overwritten. Returns true when the row was
// updated, false when either the token is internally inconsistent
// (run !== claimedAt.getTime()) or the DB CAS did not match.
export async function markSourceOwnedByDurable(
  sourceId: string,
  workflowId: string,
  token: KnowledgeSourceClaimToken,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  if (token.run !== token.claimedAt.getTime()) {
    return false;
  }

  const ownerToken = `${DURABLE_OWNER_PREFIX}${workflowId}`;
  const rows = await db
    .update(knowledgeSources)
    .set({ failureReason: ownerToken, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.updatedAt, token.claimedAt),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

// Releases the durable-owner marker set by markSourceOwnedByDurable, putting
// the source back to pending so the next scan can pick it up.
export async function releaseDurableOwner(
  sourceId: string,
  workflowId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const ownerToken = `${DURABLE_OWNER_PREFIX}${workflowId}`;

  await db
    .update(knowledgeSources)
    .set({ status: "pending", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.failureReason, ownerToken),
      ),
    );
}

// Fails knowledge sources that are stuck in 'processing' because their durable workflow ended.
// When executorId is null (Inngest engine): purely app-DB stale-age check.
// When executorId is a string (DBOS engine): joins dbos.workflow_status to classify ended runs.
export async function failProcessingSourcesWithEndedWorkflows(
  executorId: string | null,
  _options?: unknown,
  staleMs: number = durableStaleMs(),
  db: DbExecutor = getDb(),
): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs);

  if (executorId === null) {
    const rows = await db
      .update(knowledgeSources)
      .set({ status: "failed", failureReason: "workflow_executor_lost", updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeSources.status, "processing"),
          sql`${knowledgeSources.failureReason} LIKE ${"durable:%"}`,
          lt(knowledgeSources.updatedAt, cutoff),
        ),
      )
      .returning({ id: knowledgeSources.id });

    return rows.map((r) => r.id);
  }

  const staleEpochMs = Date.now() - staleMs;
  const prefixLen = DURABLE_OWNER_PREFIX.length;

  const result = await db.execute(sql`
    WITH ended AS (
      SELECT
        ks.id,
        ws.status AS wf_status,
        GREATEST(
          ws.updated_at,
          COALESCE((
            SELECT MAX(o.completed_at_epoch_ms)
            FROM dbos.operation_outputs o
            WHERE o.workflow_uuid = ws.workflow_uuid
          ), 0)
        ) AS last_activity_ms
      FROM knowledge_sources ks
      JOIN dbos.workflow_status ws
        ON ws.workflow_uuid = SUBSTRING(ks.failure_reason FROM ${prefixLen + 1}::int)
      WHERE ks.status = 'processing'
        AND ks.failure_reason LIKE ${"durable:%"}
    ),
    to_fail AS (
      SELECT id,
        CASE wf_status
          WHEN 'CANCELLED' THEN 'workflow_cancelled'
          WHEN 'MAX_RECOVERY_ATTEMPTS_EXCEEDED' THEN 'workflow_max_recovery_attempts_exceeded'
          ELSE 'workflow_executor_lost'
        END AS reason
      FROM ended
      WHERE wf_status IN ('CANCELLED', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED')
         OR last_activity_ms < ${staleEpochMs}
    )
    UPDATE knowledge_sources
    SET status = 'failed', failure_reason = to_fail.reason, updated_at = NOW()
    FROM to_fail
    WHERE knowledge_sources.id = to_fail.id
    RETURNING knowledge_sources.id
  `);

  return (result.rows as Array<{ id: string }>).map((r) => r.id);
}
