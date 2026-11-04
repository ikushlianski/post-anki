import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBitSchedules } from "../db/schema.js";
import { variantCardKeySql } from "./knowledge-bit-card-key.js";

export async function deleteOrphanScheduleRowsInTx(tx: DbExecutor, knowledgeBitId: string): Promise<number> {
  const activeKeys = tx
    .select({ cardKey: sql<string>`${variantCardKeySql}` })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBitId),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );
  const deleted = await tx
    .delete(knowledgeBitSchedules)
    .where(
      and(
        eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId),
        ne(knowledgeBitSchedules.cardKey, ""),
        notInArray(knowledgeBitSchedules.cardKey, activeKeys),
      ),
    )
    .returning({ cardKey: knowledgeBitSchedules.cardKey });

  return deleted.length;
}
