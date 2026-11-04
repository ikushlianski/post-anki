import { and, eq } from "drizzle-orm";
import { ITEM_CAP_REACHED_REASON } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export async function markKnowledgeSourceItemCapReached(
  id: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({
      status: "bits_detected",
      failureReason: ITEM_CAP_REACHED_REASON,
      nothingExtractedAt: null,
      updatedAt: new Date(),
    })
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
