import { and, eq, isNull, notInArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants } from "../db/schema.js";
import { recordKnowledgeBitDecision } from "./knowledge-bit-feedback-decision.repo.js";

export type TriageKnowledgeBitResult =
  | { ok: true; droppedVariantIds: string[] }
  | "not_found"
  | "blocked"
  | "no_variant"
  | "variant_not_active";

function isSameSet(left: string[], right: Set<string>): boolean {
  return left.length === right.size && left.every((id) => right.has(id));
}

export async function triageKnowledgeBit(
  id: string,
  keepVariantIds: string[],
  db: DbExecutor = getDb(),
): Promise<TriageKnowledgeBitResult> {
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

    if (!["pending", "approved"].includes(current.approvalState)) {
      return "blocked";
    }

    const active = await tx
      .select({ id: knowledgeBitQuestionVariants.id })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      );
    const activeIds = new Set(active.map((row) => row.id));

    if (current.approvalState === "approved") {
      return isSameSet(keepVariantIds, activeIds) ? { ok: true, droppedVariantIds: [] } : "blocked";
    }

    if (activeIds.size === 0) {
      return "no_variant";
    }

    if (!keepVariantIds.every((variantId) => activeIds.has(variantId))) {
      return "variant_not_active";
    }

    const dropped = await tx
      .update(knowledgeBitQuestionVariants)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
          notInArray(knowledgeBitQuestionVariants.id, keepVariantIds),
        ),
      )
      .returning({ id: knowledgeBitQuestionVariants.id });
    await tx.update(knowledgeBits).set({ approvalState: "approved", reviewFlag: null }).where(eq(knowledgeBits.id, id));
    await recordKnowledgeBitDecision(tx, { bitId: id, verdict: "approved" });

    return { ok: true, droppedVariantIds: dropped.map((row) => row.id) };
  });
}
