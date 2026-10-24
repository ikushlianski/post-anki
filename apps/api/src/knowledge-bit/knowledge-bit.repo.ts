import { and, eq, exists, isNull, lt, not, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBits,
  knowledgeBitQuestionVariants,
  knowledgeBitVariantAttempts,
  knowledgeSources,
  tagAssignments,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { DetectedKnowledgeBit } from "./detected-knowledge-bit.js";
import { DURABLE_HARD_CEILING_MS, DURABLE_OWNER_PREFIX, durableStaleMs } from "./durable-extraction.config.js";

export interface KnowledgeBitRow {
  id: string;
  body: string;
  approvalState: "pending" | "approved" | "rejected" | "superseded";
  isAiGenerated: boolean;
  sourceLinks: string[];
}

export async function getKnowledgeBitById(
  id: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitRow | null> {
  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      approvalState: knowledgeBits.approvalState,
      isAiGenerated: knowledgeBits.isAiGenerated,
      sourceLinks: knowledgeBits.sourceLinks,
    })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, id))
    .limit(1);

  const row = rows[0];

  return row
    ? {
        ...row,
        approvalState: row.approvalState as KnowledgeBitRow["approvalState"],
        sourceLinks: row.sourceLinks ?? [],
      }
    : null;
}

export async function insertKnowledgeBits(
  sourceId: string,
  bits: DetectedKnowledgeBit[],
  db: DbExecutor = getDb(),
): Promise<void> {
  if (bits.length === 0) {
    return;
  }

  const rows = bits.map((bit, ordinal) => ({
    id: newId("kb"),
    knowledgeSourceId: sourceId,
    ordinal,
    body: bit.text,
    background: bit.background,
  }));

  await db
    .insert(knowledgeBits)
    .values(rows)
    .onConflictDoNothing({ target: [knowledgeBits.knowledgeSourceId, knowledgeBits.ordinal] });
}

export interface PendingKnowledgeSource {
  id: string;
  rawText: string | null;
  extractionModelId: string | null;
  subjectId: string | null;
  // The `updatedAt` value this exact claim set — an ownership token. Every
  // later write for this source must require it still matches, so a claim
  // reclaimed by `resetStaleProcessingKnowledgeSources` (or a second scan)
  // can never be corrupted by a late-finishing first attempt.
  claimedAt: Date;
}

export async function claimPendingKnowledgeSources(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSource[]> {
  const candidates = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.status, "pending"))
    .limit(limit);

  const claimed: PendingKnowledgeSource[] = [];

  for (const candidate of candidates) {
    const claimedAt = new Date();
    const rows = await db
      .update(knowledgeSources)
      .set({ status: "processing", updatedAt: claimedAt })
      .where(and(eq(knowledgeSources.id, candidate.id), eq(knowledgeSources.status, "pending")))
      .returning({
        id: knowledgeSources.id,
        rawText: knowledgeSources.rawText,
        extractionModelId: knowledgeSources.extractionModelId,
        subjectId: knowledgeSources.subjectId,
      });

    const claimedRow = rows[0];

    if (claimedRow) {
      claimed.push({ ...claimedRow, claimedAt });
    }
  }

  return claimed;
}

export async function markKnowledgeSourceFailed(
  id: string,
  reason: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        eq(knowledgeSources.updatedAt, claimedAt),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function markKnowledgeSourceBitsDetected(
  id: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "bits_detected", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        eq(knowledgeSources.updatedAt, claimedAt),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function insertKnowledgeBitsAndMarkDetected(
  sourceId: string,
  bits: DetectedKnowledgeBit[],
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const stillOwned = await markKnowledgeSourceBitsDetected(sourceId, claimedAt, tx);

    if (!stillOwned) {
      throw new Error("knowledge_source_reclaimed");
    }

    await insertKnowledgeBits(sourceId, bits, tx);
  });
}

export async function updateKnowledgeBitBody(
  id: string,
  body: string,
  background?: string | null,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ body: knowledgeBits.body, approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    // Only a still-pending bit can have its own fact text edited here — once approved, a body
    // edit's regeneration cascade (wipes embedding/tags/placement/Q&A) would silently invalidate
    // content a learner may already be relying on, with no review gate left to catch it.
    if (!current || current.approvalState !== "pending") {
      return false;
    }

    // A background-only edit (body unchanged) skips the cascade below — every scan's candidate
    // query reads only `body`, so nothing derived from it is actually stale.
    if (current.body === body) {
      if (background !== undefined) {
        await tx.update(knowledgeBits).set({ background }).where(eq(knowledgeBits.id, id));
      }

      return true;
    }

    const rows = await tx
      .update(knowledgeBits)
      .set({
        body,
        ...(background !== undefined ? { background } : {}),
        embedding: null,
        embeddingVec: null,
        embeddingHash: null,
        embeddedAt: null,
        taggedAt: null,
        tagFailedAt: null,
        placementSuggestion: null,
        placementCheckedAt: null,
        placementFailedAt: null,
        placementSuggestionResolvedAt: null,
        whQuestionGeneratedAt: null,
        whQuestionGenerationFailedAt: null,
        whQuestionGenerationAttempts: 0,
        whQuestionGenerationClaimedAt: null,
        whQuestionGenerationClaimToken: null,
        fillBlankGeneratedAt: null,
        fillBlankGenerationFailedAt: null,
        fillBlankGenerationAttempts: 0,
        fillBlankGenerationClaimedAt: null,
        fillBlankGenerationClaimToken: null,
        basicCardGeneratedAt: null,
        basicCardGenerationFailedAt: null,
        basicCardGenerationAttempts: 0,
        basicCardGenerationClaimedAt: null,
        basicCardGenerationClaimToken: null,
      })
      .where(eq(knowledgeBits.id, id))
      .returning({ id: knowledgeBits.id });

    if (rows.length === 0) {
      return false;
    }

    const hasAttempt = exists(
      tx
        .select({ one: sql`1` })
        .from(knowledgeBitVariantAttempts)
        .where(eq(knowledgeBitVariantAttempts.variantId, knowledgeBitQuestionVariants.id)),
    );

    // A variant with real learner attempts attached can't be deleted outright — attempts have no
    // FK to this table, so deleting the row would orphan that history permanently. Detach it
    // instead (supersededAt), which also frees its (bit, kind, order) slot for regeneration, since
    // the unique index only covers non-superseded rows. The isNull guard keeps the original
    // supersededAt if this bit's body is edited again before regeneration catches up.
    await tx
      .update(knowledgeBitQuestionVariants)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
          hasAttempt,
        ),
      );

    await tx
      .delete(knowledgeBitQuestionVariants)
      .where(and(eq(knowledgeBitQuestionVariants.knowledgeBitId, id), not(hasAttempt)));

    await tx
      .delete(tagAssignments)
      .where(
        and(
          eq(tagAssignments.nodeType, "knowledgeBit"),
          eq(tagAssignments.nodeId, id),
          eq(tagAssignments.source, "auto"),
        ),
      );

    return true;
  });
}

export async function resetStaleProcessingKnowledgeSources(
  staleAfterMs: number,
  db: DbExecutor = getDb(),
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const durableCeiling = new Date(Date.now() - DURABLE_HARD_CEILING_MS);

  const rows = await db
    .update(knowledgeSources)
    .set({ status: "pending", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.status, "processing"),
        lt(knowledgeSources.updatedAt, cutoff),
        sql`(${knowledgeSources.failureReason} IS NULL OR ${knowledgeSources.failureReason} NOT LIKE ${`${DURABLE_OWNER_PREFIX}%`} OR ${knowledgeSources.updatedAt} < ${durableCeiling})`,
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length;
}

const RUN_ID_SEPARATOR = "#";

function ownerMatches(workflowId: string) {
  const token = `${DURABLE_OWNER_PREFIX}${workflowId}`;

  return sql`(${knowledgeSources.failureReason} = ${token} OR ${knowledgeSources.failureReason} LIKE ${`${token.replace(/[\\%_]/g, "\\$&")}${RUN_ID_SEPARATOR}%`})`;
}

export async function claimOrLoadSourceForExtraction(
  id: string,
  options: { regeneration: boolean; workflowId: string; engineRunId?: string },
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSource | null> {
  const ownerToken = `${DURABLE_OWNER_PREFIX}${options.workflowId}`;
  const writtenToken = options.engineRunId ? `${ownerToken}${RUN_ID_SEPARATOR}${options.engineRunId}` : ownerToken;
  const claimedAt = new Date();

  const claimed = options.regeneration
    ? []
    : await db
        .update(knowledgeSources)
        .set({ status: "processing", failureReason: writtenToken, updatedAt: claimedAt })
        .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "pending")))
        .returning({
          id: knowledgeSources.id,
          rawText: knowledgeSources.rawText,
          extractionModelId: knowledgeSources.extractionModelId,
          subjectId: knowledgeSources.subjectId,
        });

  if (claimed[0]) {
    return { ...claimed[0], claimedAt };
  }

  const existing = (
    await db
      .select({
        id: knowledgeSources.id,
        rawText: knowledgeSources.rawText,
        extractionModelId: knowledgeSources.extractionModelId,
        subjectId: knowledgeSources.subjectId,
        updatedAt: knowledgeSources.updatedAt,
      })
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, id),
          eq(knowledgeSources.status, "processing"),
          ownerMatches(options.workflowId),
        ),
      )
      .limit(1)
  )[0];

  if (existing && options.engineRunId) {
    await db
      .update(knowledgeSources)
      .set({ failureReason: writtenToken })
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "processing"), ownerMatches(options.workflowId)));
  }

  return existing ? { ...existing, claimedAt: existing.updatedAt } : null;
}

export async function failSourceByEngineRunId(
  engineRunId: string,
  reason: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const suffix = `${RUN_ID_SEPARATOR}${engineRunId}`.replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.status, "processing"),
        sql`${knowledgeSources.failureReason} LIKE ${`${DURABLE_OWNER_PREFIX}%${suffix}`}`,
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function failSourceOwnedByWorkflow(
  id: string,
  workflowId: string,
  reason: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        ownerMatches(workflowId),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function getKnowledgeSourceRawText(
  id: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const row = (
    await db
      .select({ rawText: knowledgeSources.rawText })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, id))
      .limit(1)
  )[0];

  const text = row?.rawText?.trim() ?? "";

  return text.length > 0 ? text : null;
}

// Fails knowledge sources that are stuck in 'processing' because their durable workflow ended.
// When executorId is null (Inngest engine): purely app-DB stale-age check.
// When executorId is a string (DBOS engine): joins dbos.workflow_status to classify ended runs.
// Token returned by getKnowledgeSourceClaimToken. `run` is `updatedAt` in
// milliseconds; it doubles as the workflow-id counter (`${sourceId}:${run}`)
// and must equal `claimedAt.getTime()`. Both fields serve as a CAS guard in
// markSourceOwnedByDurable: an inconsistent token (run !== claimedAt.getTime())
// is rejected immediately, and a stale one is rejected by the DB CAS.
export interface KnowledgeSourceClaimToken {
  run: number;
  claimedAt: Date;
}

export async function getKnowledgeSourceClaimToken(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSourceClaimToken> {
  const row = (
    await db
      .select({ updatedAt: knowledgeSources.updatedAt })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1)
  )[0];

  if (!row) {
    throw new Error(`source_not_found:${sourceId}`);
  }

  return { run: row.updatedAt.getTime(), claimedAt: row.updatedAt };
}

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

// Checks whether a durable workflow id is present in the DBOS workflow_status
// table. Used only with the DBOS engine; the Inngest path uses
// makeInngestWorkflowExists in the starter instead.
export async function durableWorkflowExists(
  workflowId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM dbos.workflow_status WHERE workflow_uuid = ${workflowId} LIMIT 1`,
  );

  return result.rows.length > 0;
}

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
