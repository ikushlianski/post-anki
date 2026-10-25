import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { EXTRACTION_STUCK_AFTER_MS, type KnowledgeSourceRegenerationStatus } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import type { PendingKnowledgeSource } from "../knowledge-bit/knowledge-bit.repo.js";

export type ClaimSourceForRegenerationResult =
  | { ok: true; source: PendingKnowledgeSource; supersededCount: number }
  | { ok: false; error: "not_found" | "already_running" | "source_text_missing" };

export interface ClaimSourceForRegenerationOptions {
  replacementText?: string;
  now?: Date;
}

export async function claimSourceForRegeneration(
  id: string,
  options: ClaimSourceForRegenerationOptions = {},
  db: DbExecutor = getDb(),
): Promise<ClaimSourceForRegenerationResult> {
  return db.transaction(async (tx) => {
    const claimedAt = options.now ?? new Date();
    const stuckBefore = new Date(claimedAt.getTime() - EXTRACTION_STUCK_AFTER_MS);
    const replacementText = options.replacementText;
    const claimed = (
      await tx
        .update(knowledgeSources)
        .set({
          status: "processing",
          updatedAt: claimedAt,
          failureReason: null,
          ...(replacementText === undefined ? {} : { rawText: replacementText }),
        })
        .where(
          and(
            eq(knowledgeSources.id, id),
            or(
              inArray(knowledgeSources.status, ["bits_detected", "failed"]),
              and(eq(knowledgeSources.status, "processing"), lt(knowledgeSources.updatedAt, stuckBefore)),
            ),
            replacementText === undefined ? isNotNull(knowledgeSources.rawText) : undefined,
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
      const existing = (
        await tx
          .select({ rawText: knowledgeSources.rawText })
          .from(knowledgeSources)
          .where(eq(knowledgeSources.id, id))
      )[0];

      if (!existing) {
        return { ok: false as const, error: "not_found" as const };
      }

      return {
        ok: false as const,
        error:
          existing.rawText === null
            ? ("source_text_missing" as const)
            : ("already_running" as const),
      };
    }

    const superseded = await tx
      .update(knowledgeBits)
      .set({ approvalState: "superseded" })
      .where(and(eq(knowledgeBits.knowledgeSourceId, id), eq(knowledgeBits.approvalState, "pending")))
      .returning({ id: knowledgeBits.id });

    return {
      ok: true as const,
      source: {
        id: claimed.id,
        rawText: claimed.rawText,
        extractionModelId: claimed.extractionModelId,
        subjectId: claimed.subjectId,
        claimedAt,
      },
      supersededCount: superseded.length,
    };
  });
}

export async function getKnowledgeSourceRegenerationStatus(
  id: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSourceRegenerationStatus | null> {
  const row = (
    await db
      .select({ status: knowledgeSources.status, failureReason: knowledgeSources.failureReason })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, id))
  )[0];

  if (!row) {
    return null;
  }

  if (row.status === "bits_detected") {
    return { status: "done", failureReason: null };
  }

  if (row.status === "failed") {
    return { status: "failed", failureReason: row.failureReason };
  }

  return { status: "running", failureReason: null };
}
