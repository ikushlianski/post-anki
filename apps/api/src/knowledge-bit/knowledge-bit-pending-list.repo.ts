import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  isOrderedListKind,
  rejectReasonCodesForSubjectType,
  subjectCheckConfidenceSchema,
  type KnowledgeBitQuestionVariantKind,
  type PendingKnowledgeSourceForReview,
  type PendingReviewCursor,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitFusionModels, knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources, subjects } from "../db/schema.js";
import { loadDuplicateOf } from "../card-dedup/card-dedup.repo.js";
import { loadSubjectKindRows, pickRejectSubjectType } from "../subject/reject-subject-type.js";
import { pendingReviewFilter } from "./knowledge-bit-pending-total.repo.js";
import { pendingReviewCreatedAtText, pendingReviewCursorFilter } from "./knowledge-bit-pending-cursor.repo.js";

export async function listPendingKnowledgeBitsForReview(
  limit: number,
  db: DbExecutor = getDb(),
  subjectId?: string,
  cursor?: PendingReviewCursor,
): Promise<PendingKnowledgeSourceForReview[]> {
  const suggestedSubjects = alias(subjects, "suggested_subjects");
  const bitRows = await db
    .select({
      id: knowledgeBits.id,
      createdAtText: pendingReviewCreatedAtText,
      body: knowledgeBits.body,
      background: knowledgeBits.background,
      exampleAiGeneratedAt: knowledgeBits.exampleAiGeneratedAt,
      origin: knowledgeBits.origin,
      reviewFlag: knowledgeBits.reviewFlag,
      duplicateOfBitId: knowledgeBits.duplicateOfBitId,
      duplicateSimilarity: knowledgeBits.duplicateSimilarity,
      duplicateReason: knowledgeBits.duplicateReason,
      similarBitIds: knowledgeBits.similarBitIds,
      isAiGenerated: knowledgeBits.isAiGenerated,
      aiSuggestion: knowledgeBits.aiSuggestion,
      sourceLinks: knowledgeBits.sourceLinks,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      sourceKind: knowledgeSources.kind,
      sourceText: knowledgeSources.rawText,
      sourceUrl: knowledgeSources.sourceUrl,
      summary: knowledgeSources.summary,
      processedAt: knowledgeSources.processedAt,
      subjectName: subjects.name,
      subjectId: subjects.id,
      suggestedSubjectId: suggestedSubjects.id,
      suggestedSubjectName: suggestedSubjects.name,
      suggestedSubjectConfidence: knowledgeSources.suggestedSubjectConfidence,
    })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(subjects, eq(subjects.id, knowledgeSources.subjectId))
    .leftJoin(suggestedSubjects, and(isNull(knowledgeSources.subjectId), eq(suggestedSubjects.id, knowledgeSources.suggestedSubjectId)))
    .where(and(pendingReviewFilter(subjectId), pendingReviewCursorFilter(cursor)))
    .orderBy(asc(knowledgeBits.createdAt), asc(knowledgeBits.id))
    .limit(limit);

  if (bitRows.length === 0) {
    return [];
  }

  const bitIds = bitRows.map((row) => row.id);

  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      context: knowledgeBitQuestionVariants.context,
      answer: knowledgeBitQuestionVariants.answer,
      sentence: knowledgeBitQuestionVariants.sentence,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .orderBy(asc(knowledgeBitQuestionVariants.order));

  const variantsByBitId = new Map<string, typeof variantRows>();

  for (const variant of variantRows) {
    const existing = variantsByBitId.get(variant.knowledgeBitId) ?? [];
    existing.push(variant);
    variantsByBitId.set(variant.knowledgeBitId, existing);
  }

  const modelRows = await db
    .select({ bitId: knowledgeBitFusionModels.bitId, modelId: knowledgeBitFusionModels.modelId })
    .from(knowledgeBitFusionModels)
    .where(inArray(knowledgeBitFusionModels.bitId, bitIds))
    .orderBy(asc(knowledgeBitFusionModels.modelId));
  const modelIdsByBitId = new Map<string, string[]>();

  for (const { bitId, modelId } of modelRows) {
    modelIdsByBitId.set(bitId, [...(modelIdsByBitId.get(bitId) ?? []), modelId]);
  }

  const duplicateOf = await loadDuplicateOf(
    new Map(
      bitRows.flatMap((row) =>
        row.duplicateOfBitId === null || row.duplicateSimilarity === null
          ? []
          : [[row.id, {
                  bitId: row.duplicateOfBitId,
                  similarity: row.duplicateSimilarity,
                  reason: row.duplicateReason,
                  similarBitIds: row.similarBitIds ?? [row.duplicateOfBitId],
                }] as const],
      ),
    ),
    db,
  );
  const subjectKindRows = await loadSubjectKindRows(db);
  const sourcesById = new Map<string, PendingKnowledgeSourceForReview>();

  for (const row of bitRows) {
    const source = sourcesById.get(row.knowledgeSourceId) ?? {
      knowledgeSourceId: row.knowledgeSourceId,
      sourceText: row.sourceText,
      sourceUrl: row.sourceUrl,
      summary: row.summary,
      subjectName: row.subjectName ?? null,
      subjectId: row.subjectId ?? null,
      suggestedSubjectId: row.suggestedSubjectId ?? null,
      suggestedSubjectName: row.suggestedSubjectName ?? null,
      suggestedSubjectConfidence: subjectCheckConfidenceSchema.safeParse(row.suggestedSubjectConfidence).data ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      rejectReasonCodes: [...rejectReasonCodesForSubjectType(pickRejectSubjectType(row.subjectId ?? null, subjectKindRows))],
      bits: [],
    };

    if (row.processedAt) {
      sourcesById.set(row.knowledgeSourceId, source);
      continue;
    }

    const variants = variantsByBitId.get(row.id) ?? [];

    source.bits.push({
      id: row.id,
      createdAt: row.createdAtText,
      body: row.body,
      background: row.background,
      exampleAiGeneratedAt: row.exampleAiGeneratedAt?.toISOString() ?? null,
      origin: row.origin ?? "extracted",
      reviewFlag: row.reviewFlag,
      duplicateOf: duplicateOf.get(row.id) ?? null,
      isAiGenerated: row.isAiGenerated,
      aiSuggestion: row.aiSuggestion,
      sourceLinks: row.sourceLinks ?? [],
      modelIds: modelIdsByBitId.get(row.id) ?? [],
      ...(row.sourceKind === "phrase" && variants.length >= 2 ? { answerChoice: true } : {}),
      variants: variants.map((variant) => ({
        id: variant.id,
        kind: variant.kind as KnowledgeBitQuestionVariantKind,
        prompt: variant.prompt,
        ...(variant.context ? { context: variant.context } : {}),
        answer: variant.answer,
        ...(variant.kind === "cloze" || isOrderedListKind(variant.kind) ? { sentence: variant.sentence } : {}),
      })),
    });

    sourcesById.set(row.knowledgeSourceId, source);
  }

  return [...sourcesById.values()];
}
