import { and, avg, count, eq, gte, isNotNull, sql, type SQL } from "drizzle-orm";
import { CARD_QUALITY_UNKNOWN_MODEL } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitFeedback, knowledgeBits } from "../db/schema.js";

export interface ModelStateCounts {
  modelId: string;
  approved: number;
  rejected: number;
  chat: number;
  pending: number;
  superseded: number;
}

export interface ModelRatingRow {
  modelId: string;
  averageRating: number | null;
}

export interface ModelReasonRow {
  modelId: string;
  reasonCode: string;
  count: number;
}

const modelKey = sql<string>`coalesce(${knowledgeBits.generatedByModelId}, ${sql.raw(`'${CARD_QUALITY_UNKNOWN_MODEL}'`)})`;

function bitFilter(since: Date | null): SQL | undefined {
  const notManual = sql`${knowledgeBits.origin} <> 'manual'`;

  return since ? and(notManual, gte(knowledgeBits.createdAt, since)) : notManual;
}

function stateCount(state: string): SQL<number> {
  return sql<number>`count(*) filter (where ${knowledgeBits.approvalState} = ${state})::int`;
}

export async function loadStateCountsByModel(since: Date | null, db: DbExecutor = getDb()): Promise<ModelStateCounts[]> {
  return db
    .select({
      modelId: modelKey,
      approved: stateCount("approved"),
      rejected: stateCount("rejected"),
      chat: stateCount("chat"),
      pending: sql<number>`count(*) filter (where ${knowledgeBits.approvalState} in ('pending', 'inbox'))::int`,
      superseded: stateCount("superseded"),
    })
    .from(knowledgeBits)
    .where(bitFilter(since))
    .groupBy(modelKey);
}

export async function loadAverageRatingByModel(since: Date | null, db: DbExecutor = getDb()): Promise<ModelRatingRow[]> {
  return db
    .select({ modelId: modelKey, averageRating: avg(knowledgeBitFeedback.rating).mapWith(Number) })
    .from(knowledgeBitFeedback)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitFeedback.knowledgeBitId))
    .where(and(bitFilter(since), isNotNull(knowledgeBitFeedback.rating)))
    .groupBy(modelKey)
    .then((rows) => rows.map((row) => ({ ...row, averageRating: Number.isNaN(row.averageRating) ? null : row.averageRating })));
}

export async function loadRejectReasonsByModel(since: Date | null, db: DbExecutor = getDb()): Promise<ModelReasonRow[]> {
  return db
    .select({
      modelId: modelKey,
      reasonCode: sql<string>`${knowledgeBitFeedback.reasonCode}`,
      count: count(knowledgeBitFeedback.id).mapWith(Number),
    })
    .from(knowledgeBitFeedback)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitFeedback.knowledgeBitId))
    .where(
      and(
        bitFilter(since),
        eq(knowledgeBitFeedback.verdict, "rejected"),
        isNotNull(knowledgeBitFeedback.reasonCode),
        sql`${knowledgeBitFeedback.reasonCode} <> 'unspecified'`,
      ),
    )
    .groupBy(modelKey, knowledgeBitFeedback.reasonCode);
}
