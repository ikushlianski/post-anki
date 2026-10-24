import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitFeedback, knowledgeBits } from "../db/schema.js";

export async function restoreDecidedKnowledgeBit(db: DbExecutor, bitId: string): Promise<boolean> {
  for (const verdict of ["rejected", "approved"] as const) {
    const restored = await db
      .update(knowledgeBits)
      .set({ approvalState: "pending" })
      .where(and(eq(knowledgeBits.id, bitId), eq(knowledgeBits.approvalState, verdict)))
      .returning({ id: knowledgeBits.id });

    if (restored.length > 0) {
      await releaseDecisionFeedback(db, bitId, verdict);

      return true;
    }
  }

  return false;
}

export async function releaseRejectionFeedback(db: DbExecutor, bitId: string): Promise<void> {
  await releaseDecisionFeedback(db, bitId, "rejected");
}

export async function releaseDecisionFeedback(
  db: DbExecutor,
  bitId: string,
  verdict: "approved" | "rejected",
): Promise<void> {
  const rejected = and(
    eq(knowledgeBitFeedback.knowledgeBitId, bitId),
    eq(knowledgeBitFeedback.verdict, verdict),
  );

  await db
    .update(knowledgeBitFeedback)
    .set({ verdict: "pending", reasonCode: null })
    .where(
      and(
        rejected,
        or(
          isNotNull(knowledgeBitFeedback.rating),
          isNotNull(knowledgeBitFeedback.wordingRating),
          isNotNull(knowledgeBitFeedback.note),
        ),
      ),
    );

  await db
    .delete(knowledgeBitFeedback)
    .where(
      and(
        rejected,
        isNull(knowledgeBitFeedback.rating),
        isNull(knowledgeBitFeedback.wordingRating),
        isNull(knowledgeBitFeedback.note),
      ),
    );
}
