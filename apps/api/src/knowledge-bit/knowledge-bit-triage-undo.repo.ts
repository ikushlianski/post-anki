import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants } from "../db/schema.js";
import { releaseDecisionFeedback } from "./knowledge-bit-feedback-restore.repo.js";

export type UndoTriageKnowledgeBitResult =
  | true
  | "not_found"
  | "blocked"
  | "variant_not_superseded"
  | "slot_taken";

const slotKey = (row: { kind: string; order: number }): string => `${row.kind}:${row.order}`;

export async function undoTriageKnowledgeBit(
  id: string,
  restoreVariantIds: string[],
  db: DbExecutor = getDb(),
): Promise<UndoTriageKnowledgeBitResult> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    if (!current) {
      return "not_found";
    }

    if (!["approved", "pending"].includes(current.approvalState)) {
      return "blocked";
    }

    const variants = await tx
      .select({
        id: knowledgeBitQuestionVariants.id,
        kind: knowledgeBitQuestionVariants.kind,
        order: knowledgeBitQuestionVariants.order,
        supersededAt: knowledgeBitQuestionVariants.supersededAt,
      })
      .from(knowledgeBitQuestionVariants)
      .where(eq(knowledgeBitQuestionVariants.knowledgeBitId, id));
    const byId = new Map(variants.map((row) => [row.id, row]));

    if (current.approvalState === "pending") {
      const allActive = restoreVariantIds.every((variantId) => {
        const row = byId.get(variantId);

        return row !== undefined && row.supersededAt === null;
      });

      return allActive ? true : "blocked";
    }

    const restoring = restoreVariantIds.map((variantId) => byId.get(variantId));

    if (restoring.some((row) => row === undefined || row.supersededAt === null)) {
      return "variant_not_superseded";
    }

    const taken = new Set(variants.filter((row) => row.supersededAt === null).map(slotKey));

    for (const row of restoring) {
      if (row === undefined || taken.has(slotKey(row))) {
        return "slot_taken";
      }

      taken.add(slotKey(row));
    }

    await tx
      .update(knowledgeBitQuestionVariants)
      .set({ supersededAt: null })
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
          inArray(knowledgeBitQuestionVariants.id, restoreVariantIds),
          isNotNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      );
    await tx
      .update(knowledgeBits)
      .set({ approvalState: "pending" })
      .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.approvalState, "approved")));
    await releaseDecisionFeedback(tx, id, "approved");

    return true;
  });
}
