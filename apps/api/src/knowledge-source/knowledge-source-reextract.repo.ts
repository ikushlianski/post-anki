import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import type { PendingKnowledgeSource } from "../knowledge-bit/knowledge-bit.repo.js";

export interface ReextractCandidate {
  id: string;
  subjectId: string | null;
  rawTextLength: number;
  status: string;
  liveBitCount: number;
}

export type ReextractClaimResult =
  | { ok: true; source: PendingKnowledgeSource; supersededCount: number }
  | { ok: false; error: "not_found" | "not_reextractable" };

export async function listReextractCandidates(
  filter: { subjectId?: string } = {},
  db: DbExecutor = getDb(),
): Promise<ReextractCandidate[]> {
  const sources = await db
    .select({
      id: knowledgeSources.id,
      subjectId: knowledgeSources.subjectId,
      rawText: knowledgeSources.rawText,
      status: knowledgeSources.status,
    })
    .from(knowledgeSources)
    .where(
      and(
        isNotNull(knowledgeSources.rawText),
        inArray(knowledgeSources.status, ["bits_detected", "failed"]),
        filter.subjectId ? eq(knowledgeSources.subjectId, filter.subjectId) : undefined,
      ),
    )
    .orderBy(knowledgeSources.createdAt);
  const liveCounts = await db
    .select({ sourceId: knowledgeBits.knowledgeSourceId, total: count() })
    .from(knowledgeBits)
    .where(ne(knowledgeBits.approvalState, "superseded"))
    .groupBy(knowledgeBits.knowledgeSourceId);
  const countBySource = new Map(liveCounts.map((row) => [row.sourceId, row.total]));

  return sources.map((source) => ({
    id: source.id,
    subjectId: source.subjectId,
    rawTextLength: source.rawText?.length ?? 0,
    status: source.status,
    liveBitCount: countBySource.get(source.id) ?? 0,
  }));
}

export async function claimSourceAndSupersedeAllBits(
  id: string,
  db: DbExecutor = getDb(),
): Promise<ReextractClaimResult> {
  return db.transaction(async (tx) => {
    const claimedAt = new Date();
    const claimed = (
      await tx
        .update(knowledgeSources)
        .set({ status: "processing", updatedAt: claimedAt, failureReason: null })
        .where(
          and(
            eq(knowledgeSources.id, id),
            inArray(knowledgeSources.status, ["bits_detected", "failed"]),
            isNotNull(knowledgeSources.rawText),
          ),
        )
        .returning({
          id: knowledgeSources.id,
          rawText: knowledgeSources.rawText,
          extractionModelId: knowledgeSources.extractionModelId,
          subjectId: knowledgeSources.subjectId,
        })
    )[0];

    if (!claimed) {
      const exists = (
        await tx.select({ id: knowledgeSources.id }).from(knowledgeSources).where(eq(knowledgeSources.id, id))
      )[0];

      return { ok: false as const, error: exists ? ("not_reextractable" as const) : ("not_found" as const) };
    }

    const superseded = await tx
      .update(knowledgeBits)
      .set({ approvalState: "superseded" })
      .where(and(eq(knowledgeBits.knowledgeSourceId, id), ne(knowledgeBits.approvalState, "superseded")))
      .returning({ id: knowledgeBits.id });

    return {
      ok: true as const,
      source: { ...claimed, claimedAt },
      supersededCount: superseded.length,
    };
  });
}
