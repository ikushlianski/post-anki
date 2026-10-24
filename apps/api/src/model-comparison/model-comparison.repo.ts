import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  MODEL_COMPARISON_PREVIEW_CHARS,
  type GradeComparisonCardInput,
  type GradeModelResultInput,
  type ModelComparisonGradedResult,
  type ModelComparisonModelResult,
  type ModelComparisonRunDetail,
  type ModelComparisonRunSummary,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { modelComparisonCardGrade, modelComparisonResult, modelComparisonRun } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface SaveComparisonRunInput {
  runId: string;
  excerpt: string;
  modelIds: string[];
  estimatedCostUsd: number;
  perModelEstimatedCostUsd?: Record<string, number>;
  results: ModelComparisonModelResult[];
}

function toNumeric(value: number | undefined): string | null {
  return value === undefined ? null : value.toFixed(6);
}

function fromNumeric(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export async function saveComparisonRun(input: SaveComparisonRunInput, db: DbExecutor = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(modelComparisonRun).values({
      id: input.runId,
      excerpt: input.excerpt,
      modelIds: input.modelIds,
      estimatedCostUsd: input.estimatedCostUsd.toFixed(6),
    });

    if (input.results.length === 0) {
      return;
    }

    await tx.insert(modelComparisonResult).values(
      input.results.map((result) => ({
        id: newId("mcr"),
        runId: input.runId,
        modelId: result.modelId,
        status: result.status,
        ms: result.ms,
        returned: result.returned,
        cards: result.cards,
        dropped: result.dropped,
        error: result.error,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        actualCostUsd: result.actualCostUsd === null ? null : result.actualCostUsd.toFixed(6),
        estimatedCostUsd: toNumeric(input.perModelEstimatedCostUsd?.[result.modelId]),
      })),
    );
  });
}

export async function listComparisonRuns(limit: number, db: DbExecutor = getDb()): Promise<ModelComparisonRunSummary[]> {
  const rows = await db
    .select({
      id: modelComparisonRun.id,
      createdAt: modelComparisonRun.createdAt,
      modelIds: modelComparisonRun.modelIds,
      excerpt: modelComparisonRun.excerpt,
    })
    .from(modelComparisonRun)
    .orderBy(desc(modelComparisonRun.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    runId: row.id,
    createdAt: row.createdAt.toISOString(),
    modelIds: row.modelIds,
    excerptPreview: row.excerpt.slice(0, MODEL_COMPARISON_PREVIEW_CHARS),
  }));
}

function toCards(raw: unknown[]): ModelComparisonModelResult["cards"] {
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const card = entry as Record<string, unknown>;

    return [
      {
        statement: String(card.statement ?? ""),
        question: String(card.question ?? ""),
        answer: String(card.answer ?? ""),
        kind: String(card.kind ?? ""),
        quote: String(card.quote ?? ""),
      },
    ];
  });
}

export async function getComparisonRun(runId: string, db: DbExecutor = getDb()): Promise<ModelComparisonRunDetail | null> {
  const run = (await db.select().from(modelComparisonRun).where(eq(modelComparisonRun.id, runId)).limit(1))[0];

  if (!run) {
    return null;
  }

  const [results, grades] = await Promise.all([
    db.select().from(modelComparisonResult).where(eq(modelComparisonResult.runId, runId)).orderBy(asc(modelComparisonResult.id)),
    db.select().from(modelComparisonCardGrade).where(eq(modelComparisonCardGrade.runId, runId)),
  ]);

  const order = new Map(run.modelIds.map((id, index) => [id, index]));
  const graded: ModelComparisonGradedResult[] = results
    .map((row) => ({
      modelId: row.modelId,
      status: row.status === "ok" ? ("ok" as const) : ("failed" as const),
      ms: row.ms,
      returned: row.returned,
      cards: toCards(row.cards),
      dropped: row.dropped,
      error: row.error,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      actualCostUsd: fromNumeric(row.actualCostUsd),
      estimatedCostUsd: fromNumeric(row.estimatedCostUsd),
      extractionRating: row.extractionRating,
      extractionNote: row.extractionNote,
      cardGrades: grades
        .filter((grade) => grade.modelId === row.modelId)
        .map((grade) => ({ cardIndex: grade.cardIndex, rating: grade.rating, wordingRating: grade.wordingRating }))
        .sort((a, b) => a.cardIndex - b.cardIndex),
    }))
    .sort((a, b) => (order.get(a.modelId) ?? 0) - (order.get(b.modelId) ?? 0));

  return {
    runId: run.id,
    createdAt: run.createdAt.toISOString(),
    excerpt: run.excerpt,
    estimatedCostUsd: Number(run.estimatedCostUsd),
    results: graded,
  };
}

export async function gradeModelResult(
  runId: string,
  modelId: string,
  input: GradeModelResultInput,
  db: DbExecutor = getDb(),
): Promise<"ok" | "not_found"> {
  const updated = await db
    .update(modelComparisonResult)
    .set({
      ...(input.extractionRating !== undefined ? { extractionRating: input.extractionRating, gradedAt: new Date() } : {}),
      ...(input.note !== undefined ? { extractionNote: input.note && input.note.length > 0 ? input.note : null } : {}),
    })
    .where(and(eq(modelComparisonResult.runId, runId), eq(modelComparisonResult.modelId, modelId)))
    .returning({ id: modelComparisonResult.id });

  return updated.length === 0 ? "not_found" : "ok";
}

export async function gradeComparisonCard(
  runId: string,
  modelId: string,
  cardIndex: number,
  input: GradeComparisonCardInput,
  db: DbExecutor = getDb(),
): Promise<"ok" | "not_found"> {
  const result = (
    await db
      .select({ keptCards: sql<number>`jsonb_array_length(${modelComparisonResult.cards})::int` })
      .from(modelComparisonResult)
      .where(and(eq(modelComparisonResult.runId, runId), eq(modelComparisonResult.modelId, modelId)))
      .limit(1)
  )[0];

  if (!result || cardIndex < 0 || cardIndex >= result.keptCards) {
    return "not_found";
  }

  const patch = {
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.wordingRating !== undefined ? { wordingRating: input.wordingRating } : {}),
  };

  await db
    .insert(modelComparisonCardGrade)
    .values({ id: newId("mcg"), runId, modelId, cardIndex, ...patch })
    .onConflictDoUpdate({
      target: [modelComparisonCardGrade.runId, modelComparisonCardGrade.modelId, modelComparisonCardGrade.cardIndex],
      set: { ...patch, updatedAt: new Date() },
    });

  return "ok";
}

export interface ComparisonEvidenceRow {
  modelId: string;
  gradedRuns: number;
  extractionAverage: number | null;
  cardAverage: number | null;
  wordingAverage: number | null;
}

export async function loadComparisonEvidenceRows(db: DbExecutor = getDb()): Promise<ComparisonEvidenceRow[]> {
  const rows = await db.execute<{
    model_id: string;
    graded_runs: number;
    extraction_average: number | null;
    card_average: number | null;
    wording_average: number | null;
  }>(sql`
    select
      r.model_id as model_id,
      count(*)::int as graded_runs,
      avg(r.extraction_rating)::float as extraction_average,
      avg(cg.avg_rating)::float as card_average,
      avg(cg.avg_wording)::float as wording_average
    from model_comparison_result r
    left join (
      select run_id, model_id, avg(rating) as avg_rating, avg(wording_rating) as avg_wording
      from model_comparison_card_grade
      group by run_id, model_id
    ) cg on cg.run_id = r.run_id and cg.model_id = r.model_id
    where r.extraction_rating is not null
    group by r.model_id
  `);

  return rows.rows.map((row) => ({
    modelId: row.model_id,
    gradedRuns: row.graded_runs,
    extractionAverage: row.extraction_average,
    cardAverage: row.card_average,
    wordingAverage: row.wording_average,
  }));
}
