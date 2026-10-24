import { and, asc, avg, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  knowledgeSourceExtractionGrade,
} from "../db/schema.js";
import {
  FEEDBACK_APPROVAL_LIMIT,
  FEEDBACK_RECENT_WINDOW,
  FEEDBACK_SNAPSHOT_MAX_CHARS,
  type FeedbackRow,
  type RecentFeedback,
} from "./knowledge-bit-feedback.types.js";
import { buildModelStats } from "./knowledge-bit-feedback-stats.js";
import { excludeManualBitFeedback, GradesNotApplicableError } from "./knowledge-bit-feedback-exclusion.js";
import { releaseRejectionFeedback } from "./knowledge-bit-feedback-restore.repo.js";
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
    const restored = await tx
      .update(knowledgeBits)
      .set({ approvalState: "pending" })
      .where(and(eq(knowledgeBits.id, bitId), eq(knowledgeBits.approvalState, "rejected")))
      .returning({ id: knowledgeBits.id });

    if (restored.length === 0) {
      return false;
    }

    await releaseRejectionFeedback(tx, bitId);

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

  const gradeScope = subjectId ? eq(knowledgeSourceExtractionGrade.subjectId, subjectId) : undefined;

  const [recent, approved, grades] = await Promise.all([
    db
      .select(FEEDBACK_COLUMNS)
      .from(knowledgeBitFeedback)
      .where(and(scope, excludeManualBitFeedback))
      .orderBy(desc(knowledgeBitFeedback.createdAt))
      .limit(FEEDBACK_RECENT_WINDOW),
    db
      .select(FEEDBACK_COLUMNS)
      .from(knowledgeBitFeedback)
      .where(and(scope, eq(knowledgeBitFeedback.verdict, "approved"), excludeManualBitFeedback))
      .orderBy(desc(knowledgeBitFeedback.createdAt))
      .limit(FEEDBACK_APPROVAL_LIMIT),
    db
      .select({
        sourceId: knowledgeSourceExtractionGrade.knowledgeSourceId,
        rating: knowledgeSourceExtractionGrade.rating,
        run: knowledgeSourceExtractionGrade.runNumber,
        note: knowledgeSourceExtractionGrade.note,
      })
      .from(knowledgeSourceExtractionGrade)
      .where(gradeScope)
      .orderBy(desc(knowledgeSourceExtractionGrade.updatedAt))
      .limit(FEEDBACK_RECENT_WINDOW),
  ]);

  return {
    recent: recent as FeedbackRow[],
    approved: approved as FeedbackRow[],
    extractionGrades: grades,
  };
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
    .where(and(inArray(knowledgeBitFeedback.verdict, ["approved", "rejected"]), excludeManualBitFeedback))
    .groupBy(knowledgeBitFeedback.modelId, knowledgeBitFeedback.verdict, knowledgeBitFeedback.reasonCode);

  return buildModelStats(rows);
}

export async function upsertKnowledgeBitGrades(
  bitId: string,
  input: { rating: number },
  db: DbExecutor = getDb(),
): Promise<{ rating: number; feedbackId: string }> {
  const [bit] = await db
    .select({ origin: knowledgeBits.origin, knowledgeSourceId: knowledgeBits.knowledgeSourceId, body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, bitId))
    .limit(1);

  if (!bit) {
    throw new Error(`Knowledge bit ${bitId} not found`);
  }

  if (bit.origin === "manual") {
    throw new GradesNotApplicableError();
  }

  const existing = await db
    .select({ id: knowledgeBitFeedback.id })
    .from(knowledgeBitFeedback)
    .where(eq(knowledgeBitFeedback.knowledgeBitId, bitId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(knowledgeBitFeedback)
      .set({ rating: input.rating })
      .where(eq(knowledgeBitFeedback.id, existing.id));

    return { rating: input.rating, feedbackId: existing.id };
  }

  const id = newId("kbf");

  await db.insert(knowledgeBitFeedback).values({
    id,
    knowledgeSourceId: bit.knowledgeSourceId,
    knowledgeBitId: bitId,
    verdict: "approved",
    statement: bit.body.slice(0, FEEDBACK_SNAPSHOT_MAX_CHARS),
    rating: input.rating,
  });

  return { rating: input.rating, feedbackId: id };
}

export interface ModelEvidenceRows {
  extraction: { modelId: string; gradedRuns: number; extractionAverage: number | null }[];
  decisions: {
    modelId: string;
    cardAverage: number | null;
    wordingAverage: number | null;
    approved: number;
    rejected: number;
  }[];
}

export async function loadModelEvidenceRows(db: DbExecutor = getDb()): Promise<ModelEvidenceRows> {
  const [extraction, decisions] = await Promise.all([
    db
      .select({
        modelId: knowledgeSourceExtractionGrade.modelId,
        gradedRuns: count(knowledgeSourceExtractionGrade.id).mapWith(Number),
        extractionAverage: avg(knowledgeSourceExtractionGrade.rating).mapWith(Number),
      })
      .from(knowledgeSourceExtractionGrade)
      .groupBy(knowledgeSourceExtractionGrade.modelId),
    db
      .select({
        modelId: knowledgeBitFeedback.modelId,
        cardAverage: avg(knowledgeBitFeedback.rating).mapWith(Number),
        wordingAverage: avg(knowledgeBitFeedback.wordingRating).mapWith(Number),
        approved: sql<number>`count(*) filter (where ${knowledgeBitFeedback.verdict} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${knowledgeBitFeedback.verdict} = 'rejected')::int`,
      })
      .from(knowledgeBitFeedback)
      .where(excludeManualBitFeedback)
      .groupBy(knowledgeBitFeedback.modelId),
  ]);

  return {
    extraction: extraction
      .filter((r): r is typeof r & { modelId: string } => r.modelId !== null)
      .map((r) => ({
        modelId: r.modelId,
        gradedRuns: r.gradedRuns,
        extractionAverage: r.extractionAverage ?? null,
      })),
    decisions: decisions
      .filter((r): r is typeof r & { modelId: string } => r.modelId !== null)
      .map((r) => ({
        modelId: r.modelId,
        cardAverage: r.cardAverage ?? null,
        wordingAverage: r.wordingAverage ?? null,
        approved: r.approved,
        rejected: r.rejected,
      })),
  };
}
