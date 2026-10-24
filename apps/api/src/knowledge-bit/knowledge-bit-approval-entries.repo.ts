import { and, count, desc, eq, exists, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import type { PendingKnowledgeSourceForReview } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSourceExtractionGrade, knowledgeSources } from "../db/schema.js";

export const ENTRY_LIST_LIMIT = 100;
export const ENTRY_TEXT_PREVIEW_CHARS = 2000;

export interface ExtractionGradeForReview {
  rating: number;
  note: string | null;
  run: number;
}

export function extractionGradeKey(knowledgeSourceId: string, run: number): string {
  return `${knowledgeSourceId}:${run}`;
}

export async function fetchExtractionGrades(
  knowledgeSourceIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, ExtractionGradeForReview>> {
  const rows = await db
    .select({
      knowledgeSourceId: knowledgeSourceExtractionGrade.knowledgeSourceId,
      runNumber: knowledgeSourceExtractionGrade.runNumber,
      rating: knowledgeSourceExtractionGrade.rating,
      note: knowledgeSourceExtractionGrade.note,
    })
    .from(knowledgeSourceExtractionGrade)
    .where(inArray(knowledgeSourceExtractionGrade.knowledgeSourceId, knowledgeSourceIds));

  return new Map(
    rows.map((row) => [
      extractionGradeKey(row.knowledgeSourceId, row.runNumber),
      { rating: row.rating, note: row.note, run: row.runNumber },
    ]),
  );
}

export async function countDecidedBySource(
  knowledgeSourceIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const rows = await db
    .select({ knowledgeSourceId: knowledgeBits.knowledgeSourceId, value: count() })
    .from(knowledgeBits)
    .where(
      and(
        inArray(knowledgeBits.knowledgeSourceId, knowledgeSourceIds),
        inArray(knowledgeBits.approvalState, ["approved", "rejected"]),
      ),
    )
    .groupBy(knowledgeBits.knowledgeSourceId);

  return new Map(rows.map((row) => [row.knowledgeSourceId, row.value]));
}

export async function listFullyReviewedAndProcessedEntries(
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSourceForReview[]> {
  const entrySelection = {
    id: knowledgeSources.id,
    sourceText: sql<string | null>`substring(${knowledgeSources.rawText} from 1 for ${ENTRY_TEXT_PREVIEW_CHARS})`,
    extractionRun: knowledgeSources.extractionRun,
    sourceUrl: knowledgeSources.sourceUrl,
    summary: knowledgeSources.summary,
    processedAt: knowledgeSources.processedAt,
  };

  const fullyReviewedWhere = and(
    isNull(knowledgeSources.processedAt),
    exists(
      db
        .select({ one: knowledgeBits.id })
        .from(knowledgeBits)
        .where(
          and(
            eq(knowledgeBits.knowledgeSourceId, knowledgeSources.id),
            inArray(knowledgeBits.approvalState, ["approved", "rejected"]),
          ),
        ),
    ),
    notExists(
      db
        .select({ one: knowledgeBits.id })
        .from(knowledgeBits)
        .where(
          and(
            eq(knowledgeBits.knowledgeSourceId, knowledgeSources.id),
            eq(knowledgeBits.approvalState, "pending"),
          ),
        ),
    ),
  );
  const processedWhere = isNotNull(knowledgeSources.processedAt);

  const [fullyReviewedRows, processedRows, fullyReviewedTotal, processedTotal] = await Promise.all([
    db
      .select(entrySelection)
      .from(knowledgeSources)
      .where(fullyReviewedWhere)
      .orderBy(desc(knowledgeSources.createdAt))
      .limit(ENTRY_LIST_LIMIT),
    db
      .select(entrySelection)
      .from(knowledgeSources)
      .where(processedWhere)
      .orderBy(desc(knowledgeSources.processedAt))
      .limit(ENTRY_LIST_LIMIT),
    db.select({ value: count() }).from(knowledgeSources).where(fullyReviewedWhere),
    db.select({ value: count() }).from(knowledgeSources).where(processedWhere),
  ]);

  const totalById = new Map<string, number>([
    ...fullyReviewedRows.map((row) => [row.id, fullyReviewedTotal[0]?.value ?? 0] as const),
    ...processedRows.map((row) => [row.id, processedTotal[0]?.value ?? 0] as const),
  ]);

  const entries = [...fullyReviewedRows, ...processedRows];
  const sourceIds = entries.map((entry) => entry.id);

  const [grades, decided] = await Promise.all([
    fetchExtractionGrades(sourceIds, db),
    countDecidedBySource(sourceIds, db),
  ]);

  return entries.map((entry) => ({
    knowledgeSourceId: entry.id,
    sourceText: entry.sourceText,
    sourceUrl: entry.sourceUrl,
    summary: entry.summary,
    subjectName: null,
    extractionRun: entry.extractionRun,
    extractionGrade: grades.get(extractionGradeKey(entry.id, entry.extractionRun)) ?? null,
    processedAt: entry.processedAt?.toISOString() ?? null,
    decidedCount: decided.get(entry.id) ?? 0,
    groupTotal: totalById.get(entry.id),
    bits: [],
  }));
}
