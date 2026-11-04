import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { KnowledgeBitFeedbackVerdict, KnowledgeBitRejectReason } from "@post-anki/shared";
import { KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitFeedback,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
} from "../db/schema.js";
import { FEEDBACK_SNAPSHOT_MAX_CHARS } from "./knowledge-bit-feedback.types.js";
import { restoreDecidedKnowledgeBit } from "./knowledge-bit-feedback-restore.repo.js";
import { newId } from "../shared/id.js";

export {
  aggregateFeedbackByModel,
  loadModelEvidenceRows,
  loadRecentFeedbackForExtraction,
  upsertKnowledgeBitGrades,
  type ModelEvidenceRows,
} from "./knowledge-bit-model-evidence.repo.js";


function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.slice(0, max);
}

async function resolveModelId(sourceModelId: string | null): Promise<string | null> {
  if (sourceModelId) {
    return sourceModelId;
  }

  try {
    const { getKnowledgeItemModelId } = await import("../admin-settings/admin-settings.repo.js");

    return await getKnowledgeItemModelId();
  } catch {
    return null;
  }
}

export async function recordKnowledgeBitFeedback(
  db: DbExecutor,
  input: {
    bitId: string;
    verdict: KnowledgeBitFeedbackVerdict | "pending";
    rating?: number;
    note?: string | null;
  },
): Promise<string | null> {
  const bit = (
    await db
      .select({
        body: knowledgeBits.body,
        origin: knowledgeBits.origin,
        approvalState: knowledgeBits.approvalState,
        knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, input.bitId))
      .limit(1)
      .for("share")
  )[0];

  if (!bit || bit.origin === "manual") {
    return null;
  }

  const [source, variant] = await Promise.all([
    db
      .select({
        subjectId: knowledgeSources.subjectId,
        extractionModelId: knowledgeSources.extractionModelId,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, bit.knowledgeSourceId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        prompt: knowledgeBitQuestionVariants.prompt,
        answer: knowledgeBitQuestionVariants.answer,
      })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, input.bitId),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      )
      .orderBy(asc(knowledgeBitQuestionVariants.order), asc(knowledgeBitQuestionVariants.createdAt))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const id = newId("kbf");

  await db.insert(knowledgeBitFeedback).values({
    id,
    knowledgeSourceId: bit.knowledgeSourceId,
    knowledgeBitId: input.bitId,
    subjectId: source?.subjectId ?? null,
    modelId: await resolveModelId(source?.extractionModelId ?? null),
    verdict: input.verdict,
    reasonCode: input.verdict === "rejected" ? "unspecified" : null,
    statement: bit.body.slice(0, FEEDBACK_SNAPSHOT_MAX_CHARS),
    front: clip(variant?.prompt, FEEDBACK_SNAPSHOT_MAX_CHARS),
    back: clip(variant?.answer, FEEDBACK_SNAPSHOT_MAX_CHARS),
    rating: input.rating ?? null,
    note: input.note ?? null,
  });

  return id;
}

export async function findRejectionFeedbackId(
  db: DbExecutor,
  bitId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: knowledgeBitFeedback.id })
    .from(knowledgeBitFeedback)
    .where(
      and(eq(knowledgeBitFeedback.knowledgeBitId, bitId), eq(knowledgeBitFeedback.verdict, "rejected")),
    )
    .orderBy(desc(knowledgeBitFeedback.createdAt))
    .limit(1);

  return rows[0]?.id ?? null;
}

export async function setKnowledgeBitFeedbackReason(
  id: string,
  input: { reasonCode: KnowledgeBitRejectReason; note?: string | undefined },
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const note = input.note?.trim() ? input.note.trim().slice(0, KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS) : null;

  const rows = await db
    .update(knowledgeBitFeedback)
    .set({ reasonCode: input.reasonCode, note })
    .where(and(eq(knowledgeBitFeedback.id, id), eq(knowledgeBitFeedback.verdict, "rejected")))
    .returning({ id: knowledgeBitFeedback.id });

  return rows.length > 0;
}

export async function updateKnowledgeBitFeedback(
  id: string,
  input: { reasonCode?: KnowledgeBitRejectReason; note?: string; rating?: number },
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const patch: Partial<typeof knowledgeBitFeedback.$inferInsert> = {};

  if (input.reasonCode !== undefined) {
    patch.reasonCode = input.reasonCode;
  }

  if ("note" in input) {
    const trimmed = input.note?.trim();
    patch.note = trimmed ? trimmed.slice(0, KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS) : null;
  }

  if (input.rating !== undefined) {
    patch.rating = input.rating;
  }

  if (Object.keys(patch).length === 0) {
    return false;
  }

  const rows = await db
    .update(knowledgeBitFeedback)
    .set(patch)
    .where(eq(knowledgeBitFeedback.id, id))
    .returning({ id: knowledgeBitFeedback.id });

  return rows.length > 0;
}

export async function restoreRejectedKnowledgeBit(
  bitId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    return restoreDecidedKnowledgeBit(tx, bitId);
  });
}
