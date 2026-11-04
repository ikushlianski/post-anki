import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export async function markKnowledgeSourceNothingExtracted(
  id: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "bits_detected", failureReason: null, nothingExtractedAt: now, updatedAt: now })
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
