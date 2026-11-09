import { and, eq, exists, inArray, isNull, not, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import type { Tx } from "./knowledge-bit-manual-item.repo.js";
import {
  knowledgeBits,
  knowledgeBitQuestionVariants,
  knowledgeBitVariantAttempts,
  tagAssignments,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { DetectedKnowledgeBit } from "./detected-knowledge-bit.js";
import { deleteOrphanScheduleRowsInTx } from "./knowledge-bit-orphan-schedule.repo.js";
import { markKnowledgeSourceBitsDetected } from "./knowledge-bit-source-claim.repo.js";

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
    .onConflictDoNothing({
      target: [knowledgeBits.knowledgeSourceId, knowledgeBits.ordinal],
    });
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

export const BODY_EDIT_RESET = {
  embeddingVec: null,
  embeddingHash: null,
  embeddedAt: null,
  taggedAt: null,
  tagFailedAt: null,
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
} as const;

export async function updateKnowledgeBitBody(
  id: string,
  body: string,
  background?: string | null,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({
          body: knowledgeBits.body,
          background: knowledgeBits.background,
          approvalState: knowledgeBits.approvalState,
        })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    // Only a still-pending bit can have its own fact text edited here — once approved, a body
    // edit's regeneration cascade (wipes embedding/tags/Q&A) would silently invalidate
    // content a learner may already be relying on, with no review gate left to catch it.
    if (!current || (current.approvalState !== "pending" && current.approvalState !== "inbox")) {
      return false;
    }

    // A background-only edit (body unchanged) skips the cascade below — every scan's candidate
    // query reads only `body`, so nothing derived from it is actually stale.
    if (current.body === body) {
      if (background !== undefined) {
        await tx
          .update(knowledgeBits)
          .set({
            background,
            ...(background === current.background ? {} : { exampleAiGeneratedAt: null }),
          })
          .where(eq(knowledgeBits.id, id));
      }

      return true;
    }

    const [clozeCard] = await tx
      .select({ id: knowledgeBitQuestionVariants.id })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
          inArray(knowledgeBitQuestionVariants.kind, ["cloze", "list_step", "list_next", "list_overview"]),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      )
      .limit(1);

    if (clozeCard) {
      return false;
    }

    const rows = await tx
      .update(knowledgeBits)
      .set({
        body,
        ...(background !== undefined ? { background } : {}),
        ...(background !== undefined && background !== current.background ? { exampleAiGeneratedAt: null } : {}),
        ...BODY_EDIT_RESET,
      })
      .where(eq(knowledgeBits.id, id))
      .returning({ id: knowledgeBits.id });

    if (rows.length === 0) {
      return false;
    }

    await detachDerivedBitData(tx, id);

    return true;
  });
}

export async function detachDerivedBitData(tx: Tx, id: string): Promise<void> {
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

  await deleteOrphanScheduleRowsInTx(tx, id);

  await tx
    .delete(tagAssignments)
    .where(
      and(
        eq(tagAssignments.nodeType, "knowledgeBit"),
        eq(tagAssignments.nodeId, id),
        eq(tagAssignments.source, "auto"),
      ),
    );
}
