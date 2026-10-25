import { and, count, eq, exists, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { BulkApproveKnowledgeBitsResponse } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources } from "../db/schema.js";
import { recordKnowledgeBitDecision } from "./knowledge-bit-feedback-decision.repo.js";

// Same rules as single approve plus its UI gate: a bit needs a live variant and must still be
// pending, so one atomic UPDATE decides; the rest are classified for the skip reason.
export async function approveKnowledgeBitsBulk(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<BulkApproveKnowledgeBitsResponse> {
  return db.transaction((tx) => approveKnowledgeBitsBulkIn(ids, tx));
}

async function approveKnowledgeBitsBulkIn(
  ids: string[],
  db: DbExecutor,
): Promise<BulkApproveKnowledgeBitsResponse> {
  const uniqueIds = [...new Set(ids)];

  const approvedRows = await db
    .update(knowledgeBits)
    .set({ approvalState: "approved" })
    .where(
      and(
        inArray(knowledgeBits.id, uniqueIds),
        eq(knowledgeBits.approvalState, "pending"),
        isNull(knowledgeBits.reviewFlag),
        exists(
          db
            .select({ one: knowledgeBitQuestionVariants.id })
            .from(knowledgeBitQuestionVariants)
            .where(
              and(
                eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
                isNull(knowledgeBitQuestionVariants.supersededAt),
              ),
            ),
        ),
      ),
    )
    .returning({ id: knowledgeBits.id });

  const approved = new Set(approvedRows.map((row) => row.id));

  for (const row of approvedRows) {
    await recordKnowledgeBitDecision(db, { bitId: row.id, verdict: "approved" });
  }

  const leftover = uniqueIds.filter((id) => !approved.has(id));

  if (leftover.length === 0) {
    return { approved: [...approved], skipped: [] };
  }

  const stateRows = await db
    .select({
      id: knowledgeBits.id,
      approvalState: knowledgeBits.approvalState,
      reviewFlag: knowledgeBits.reviewFlag,
    })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, leftover));

  const stateById = new Map(stateRows.map((row) => [row.id, row.approvalState]));
  const flaggedIds = new Set(stateRows.filter((row) => row.reviewFlag !== null).map((row) => row.id));

  return {
    approved: [...approved],
    skipped: leftover.map((id) => {
      const state = stateById.get(id);

      if (state === undefined) {
        return { id, reason: "not_found" as const };
      }

      if (state === "pending" && flaggedIds.has(id)) {
        return { id, reason: "needs_manual_review" as const };
      }

      return {
        id,
        reason: state === "pending" ? ("no_variant" as const) : ("already_decided" as const),
      };
    }),
  };
}

export async function countPendingKnowledgeBits(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.approvalState, "pending"),
        notInArray(
          knowledgeBits.knowledgeSourceId,
          db.select({ id: knowledgeSources.id }).from(knowledgeSources).where(isNotNull(knowledgeSources.processedAt)),
        ),
      ),
    );

  return rows[0]?.value ?? 0;
}
