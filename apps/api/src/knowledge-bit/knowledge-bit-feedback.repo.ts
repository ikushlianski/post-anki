import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  KnowledgeBitFeedbackByModelResponse,
  KnowledgeBitFeedbackVerdict,
  KnowledgeBitRejectReason,
} from "@post-anki/shared";
import { KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitFeedback,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
} from "../db/schema.js";
import {
  FEEDBACK_APPROVAL_LIMIT,
  FEEDBACK_RECENT_WINDOW,
  FEEDBACK_SNAPSHOT_MAX_CHARS,
  type FeedbackRow,
  type RecentFeedback,
} from "./knowledge-bit-feedback.types.js";
import { buildModelStats } from "./knowledge-bit-feedback-stats.js";
import { newId } from "../shared/id.js";

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
  input: { bitId: string; verdict: KnowledgeBitFeedbackVerdict },
): Promise<string | null> {
  const bit = (
    await db
      .select({
        body: knowledgeBits.body,
        knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, input.bitId))
      .limit(1)
  )[0];

  if (!bit) {
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

export async function restoreRejectedKnowledgeBit(
  bitId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const restored = await tx
      .update(knowledgeBits)
      .set({ approvalState: "pending" })
      .where(and(eq(knowledgeBits.id, bitId), eq(knowledgeBits.approvalState, "rejected")))
      .returning({ id: knowledgeBits.id });

    if (restored.length === 0) {
      return false;
    }

    await tx
      .delete(knowledgeBitFeedback)
      .where(
        and(eq(knowledgeBitFeedback.knowledgeBitId, bitId), eq(knowledgeBitFeedback.verdict, "rejected")),
      );

    return true;
  });
}

const FEEDBACK_COLUMNS = {
  verdict: knowledgeBitFeedback.verdict,
  reasonCode: knowledgeBitFeedback.reasonCode,
  statement: knowledgeBitFeedback.statement,
  front: knowledgeBitFeedback.front,
  back: knowledgeBitFeedback.back,
};

async function loadScope(db: DbExecutor, subjectId: string | null): Promise<RecentFeedback> {
  const scope = subjectId ? eq(knowledgeBitFeedback.subjectId, subjectId) : undefined;

  const [recent, approved] = await Promise.all([
    db
      .select(FEEDBACK_COLUMNS)
      .from(knowledgeBitFeedback)
      .where(scope)
      .orderBy(desc(knowledgeBitFeedback.createdAt))
      .limit(FEEDBACK_RECENT_WINDOW),
    db
      .select(FEEDBACK_COLUMNS)
      .from(knowledgeBitFeedback)
      .where(and(scope, eq(knowledgeBitFeedback.verdict, "approved")))
      .orderBy(desc(knowledgeBitFeedback.createdAt))
      .limit(FEEDBACK_APPROVAL_LIMIT),
  ]);

  return { recent: recent as FeedbackRow[], approved: approved as FeedbackRow[] };
}

export async function loadRecentFeedbackForExtraction(
  subjectId: string | null,
  db: DbExecutor = getDb(),
): Promise<RecentFeedback> {
  if (subjectId) {
    const scoped = await loadScope(db, subjectId);

    if (scoped.recent.length > 0) {
      return scoped;
    }
  }

  return loadScope(db, null);
}

export async function aggregateFeedbackByModel(
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitFeedbackByModelResponse> {
  const rows = await db
    .select({
      modelId: knowledgeBitFeedback.modelId,
      verdict: knowledgeBitFeedback.verdict,
      reasonCode: knowledgeBitFeedback.reasonCode,
      count: sql<number>`count(*)::int`,
    })
    .from(knowledgeBitFeedback)
    .where(inArray(knowledgeBitFeedback.verdict, ["approved", "rejected"]))
    .groupBy(knowledgeBitFeedback.modelId, knowledgeBitFeedback.verdict, knowledgeBitFeedback.reasonCode);

  return buildModelStats(rows);
}
