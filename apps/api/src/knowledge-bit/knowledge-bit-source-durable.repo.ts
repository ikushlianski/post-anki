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

// Fails knowledge sources stuck in 'processing' under a durable owner marker once their last update
// is older than the stale cutoff.
export async function failProcessingSourcesWithEndedWorkflows(
  staleMs: number = durableStaleMs(),
  db: DbExecutor = getDb(),
): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs);
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
