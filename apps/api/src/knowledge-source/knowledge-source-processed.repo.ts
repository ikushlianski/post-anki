import { and, eq, ne, notExists, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export type SetProcessedResult =
  | { ok: true; id: string; processedAt: Date | null }
  | { ok: false; reason: "not_found" | "entry_processing" | "pending_items" };

export async function setKnowledgeSourceProcessed(
  id: string,
  processed: boolean,
  db: DbExecutor = getDb(),
): Promise<SetProcessedResult> {
  const noPendingItems = notExists(
    db
      .select({ one: knowledgeBits.id })
      .from(knowledgeBits)
      .where(and(eq(knowledgeBits.knowledgeSourceId, knowledgeSources.id), eq(knowledgeBits.approvalState, "pending"))),
  );

  const updated = await db
    .update(knowledgeSources)
    .set({ processedAt: processed ? sql`coalesce(${knowledgeSources.processedAt}, now())` : null })
    .where(
      and(
        eq(knowledgeSources.id, id),
        ne(knowledgeSources.status, "processing"),
        processed ? noPendingItems : undefined,
      ),
    )
    .returning({ id: knowledgeSources.id, processedAt: knowledgeSources.processedAt });

  if (updated[0]) {
    return { ok: true, ...updated[0] };
  }

  const existing = (
    await db
      .select({ id: knowledgeSources.id, status: knowledgeSources.status })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, id))
      .limit(1)
  )[0];

  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: false, reason: existing.status === "processing" ? "entry_processing" : "pending_items" };
}
