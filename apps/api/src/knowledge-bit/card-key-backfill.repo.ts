import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants as variants } from "../db/schema.js";
import type { CardKeyBackfillClient } from "./card-key-backfill.js";

export function cardKeyBackfillClient(db: DbExecutor = getDb()): CardKeyBackfillClient {
  return {
    listUnkeyed: (afterId, limit) =>
      db
        .select({ id: variants.id, prompt: variants.prompt, answer: variants.answer })
        .from(variants)
        .where(
          and(isNull(variants.cardKey), isNull(variants.supersededAt), afterId ? gt(variants.id, afterId) : undefined),
        )
        .orderBy(asc(variants.id))
        .limit(limit),
    setKeys: async (rows) => {
      for (const row of rows) {
        await db
          .update(variants)
          .set({ cardKey: row.cardKey })
          .where(and(eq(variants.id, row.id), isNull(variants.cardKey)));
      }
    },
  };
}
