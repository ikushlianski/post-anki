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

export interface KnowledgeBitRow {
  id: string;
  body: string;
  approvalState: "pending" | "approved" | "rejected";
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
    })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, id))
    .limit(1);

  const row = rows[0];

  return row
    ? { ...row, approvalState: row.approvalState as KnowledgeBitRow["approvalState"] }
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
      .returning({ id: knowledgeSources.id, rawText: knowledgeSources.rawText });

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
        .select({ body: knowledgeBits.body })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    if (!current) {
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

  const rows = await db
    .update(knowledgeSources)
    .set({ status: "pending", failureReason: null, updatedAt: new Date() })
    .where(and(eq(knowledgeSources.status, "processing"), lt(knowledgeSources.updatedAt, cutoff)))
    .returning({ id: knowledgeSources.id });

  return rows.length;
}
