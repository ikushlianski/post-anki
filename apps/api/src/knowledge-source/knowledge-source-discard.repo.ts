import { and, eq, ne } from "drizzle-orm";
import type { KnowledgeDeletionCounts } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import {
  deleteKnowledgeSource,
  purgeKnowledgeBits,
} from "../knowledge-bit/knowledge-cleanup.repo.js";

export type DiscardKnowledgeSourceResult =
  | { ok: true; counts: KnowledgeDeletionCounts }
  | { ok: false; error: "not_found" };

export async function discardKnowledgeSource(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<DiscardKnowledgeSourceResult> {
  return db.transaction(async (tx) => {
    const source = (
      await tx
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId))
        .for("update")
    )[0];

    if (!source) {
      return { ok: false as const, error: "not_found" as const };
    }

    const approved = await tx
      .select({ id: knowledgeBits.id })
      .from(knowledgeBits)
      .where(and(eq(knowledgeBits.knowledgeSourceId, sourceId), eq(knowledgeBits.approvalState, "approved")))
      .limit(1);

    if (approved.length === 0) {
      return { ok: true as const, counts: await deleteKnowledgeSource(sourceId, tx) };
    }

    const removable = await tx
      .select({ id: knowledgeBits.id })
      .from(knowledgeBits)
      .where(and(eq(knowledgeBits.knowledgeSourceId, sourceId), ne(knowledgeBits.approvalState, "approved")));
    const counts = await purgeKnowledgeBits(
      removable.map((row) => row.id),
      tx,
    );

    await tx
      .update(knowledgeSources)
      .set({ status: "bits_detected", failureReason: null, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, sourceId));

    return { ok: true as const, counts };
  });
}
