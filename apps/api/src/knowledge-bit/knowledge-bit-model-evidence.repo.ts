import { and, avg, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { KnowledgeBitFeedbackByModelResponse } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitFeedback,
  knowledgeBits,
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
import { newId } from "../shared/id.js";

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
    .select({
      origin: knowledgeBits.origin,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      body: knowledgeBits.body,
      generatedByModelId: knowledgeBits.generatedByModelId,
    })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, bitId))
    .limit(1)
    .for("share");

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
    modelId: bit.generatedByModelId,
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
