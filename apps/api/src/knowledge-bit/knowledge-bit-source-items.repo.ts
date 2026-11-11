import { and, asc, eq, max, ne } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitFusionModels, knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources } from "../db/schema.js";
import { getTriageEnabled } from "../admin-settings/admin-settings.repo.js";
import { initialBitState } from "./knowledge-bit-initial-state.js";
import { supersedeOtherVariantsIn } from "./knowledge-bit-triage.repo.js";
import { dropDuplicateCards } from "./knowledge-bit-duplicate-gate.js";
import { variantRowsForCard } from "./knowledge-bit-source-item-variants.js";
import { isSafeSourceUrl } from "@post-anki/core";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import type { FlaggedLesson, LessonDraft } from "./knowledge-bit-source-item-validation.js";

export interface SourceInsertState {
  nextOrdinal: number;
  existingStatements: string[];
}

export async function getSourceInsertState(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<SourceInsertState> {
  const [maxRow] = await db
    .select({ maxOrdinal: max(knowledgeBits.ordinal) })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.knowledgeSourceId, sourceId));
  const live = await db
    .select({ body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(
      and(eq(knowledgeBits.knowledgeSourceId, sourceId), ne(knowledgeBits.approvalState, "superseded")),
    );

  return {
    nextOrdinal: (maxRow?.maxOrdinal ?? -1) + 1,
    existingStatements: live.map((row) => row.body),
  };
}

async function keepFirstVariantOnly(tx: DbExecutor, bitIds: string[]): Promise<void> {
  for (const bitId of bitIds) {
    const [first] = await tx
      .select({ id: knowledgeBitQuestionVariants.id })
      .from(knowledgeBitQuestionVariants)
      .where(eq(knowledgeBitQuestionVariants.knowledgeBitId, bitId))
      .orderBy(asc(knowledgeBitQuestionVariants.order));

    if (first) {
      await supersedeOtherVariantsIn(tx, bitId, [first.id]);
    }
  }
}

export interface InsertSourceItemsInput {
  sourceId: string;
  claimedAt: Date;
  firstOrdinal: number;
  items: readonly LessonDraft[];
  flagged?: readonly FlaggedLesson[];
  outcome?: { skippedCards: number };
}

// Inserts bits and their variants in one transaction while this run owns the source claim; skips if the source was deleted.
export async function insertSourceItemsForChunk(
  input: InsertSourceItemsInput,
  db: DbExecutor = getDb(),
): Promise<number> {
  const { sourceId, claimedAt, firstOrdinal, items, flagged = [], outcome } = input;

  if (items.length === 0 && flagged.length === 0) {
    return 0;
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: knowledgeSources.id, sourceUrl: knowledgeSources.sourceUrl, kind: knowledgeSources.kind })
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, sourceId),
          eq(knowledgeSources.status, "processing"),
          eq(knowledgeSources.updatedAt, claimedAt),
        ),
      )
      .for("update");

    if (owned.length === 0) {
      const [present] = await tx
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId))
        .limit(1);

      if (!present) {
        log.warn({ knowledgeSourceId: sourceId }, "knowledge_source_deleted_insert_skipped");

        return 0;
      }

      throw new Error("knowledge_source_reclaimed");
    }

    const sourceUrl = owned[0]?.sourceUrl;
    const sourceLinks = sourceUrl && isSafeSourceUrl(sourceUrl).allowed ? [sourceUrl] : null;
    const stampedAt = new Date();
    const triageEnabled = await getTriageEnabled(tx);
    const state = initialBitState(triageEnabled, stampedAt);
    const allEntries = [
      ...items.map((item) => ({ item, reviewFlag: null as string | null })),
      ...flagged.map((entry) => ({ item: entry.lesson, reviewFlag: entry.reason as string | null })),
    ];
    const gate = await dropDuplicateCards(
      tx,
      allEntries.map((entry) => entry.item),
    );
    const entries = allEntries.flatMap((entry, index) => {
      const lesson = gate.lessons[index];

      return lesson ? [{ ...entry, item: lesson }] : [];
    });

    if (gate.skippedCards > 0) {
      if (outcome) {
        outcome.skippedCards += gate.skippedCards;
      }

      log.info({ knowledgeSourceId: sourceId, count: gate.skippedCards }, "cards_skipped_duplicate");
    }

    if (entries.length === 0) {
      return 0;
    }

    const itemsByOrdinal = new Map(entries.map((entry, index) => [firstOrdinal + index, entry.item]));
    const flagByOrdinal = new Map(entries.map((entry, index) => [firstOrdinal + index, entry.reviewFlag]));
    const bitRows = [...itemsByOrdinal].map(([ordinal, item]) => ({
      id: newId("kb"),
      knowledgeSourceId: sourceId,
      ordinal,
      body: item.statement,
      background: item.example,
      sourceLinks: item.webSources?.length ? item.webSources : sourceLinks,
      isAiGenerated: Boolean(item.webSources?.length),
      ...(flagByOrdinal.get(ordinal) ?? item.reviewFlag ? initialBitState(true) : state),
      reviewFlag: flagByOrdinal.get(ordinal) ?? item.reviewFlag ?? null,
      aiSuggestion: item.aiSuggestion ?? null,
      generatedByModelId: item.generatedByModelId ?? null,
      whQuestionGeneratedAt: stampedAt,
      fillBlankGeneratedAt: stampedAt,
      basicCardGeneratedAt: stampedAt,
    }));

    const inserted = await tx
      .insert(knowledgeBits)
      .values(bitRows)
      .onConflictDoNothing({ target: [knowledgeBits.knowledgeSourceId, knowledgeBits.ordinal] })
      .returning({ id: knowledgeBits.id, ordinal: knowledgeBits.ordinal });

    const variantRows = inserted.flatMap((bit) => {
      const item = itemsByOrdinal.get(bit.ordinal);

      if (!item) {
        return [];
      }

      return item.cards.flatMap((card, order) => variantRowsForCard(bit.id, card, order));
    });

    if (variantRows.length > 0) {
      await tx.insert(knowledgeBitQuestionVariants).values(variantRows);
    }

    const fusionRows = inserted.flatMap((bit) =>
      (itemsByOrdinal.get(bit.ordinal)?.modelIds ?? []).map((modelId) => ({ bitId: bit.id, modelId })),
    );

    if (fusionRows.length > 0) {
      await tx.insert(knowledgeBitFusionModels).values(fusionRows);
    }

    const approvedIds = inserted
      .filter((bit) => !(flagByOrdinal.get(bit.ordinal) ?? itemsByOrdinal.get(bit.ordinal)?.reviewFlag))
      .map((bit) => bit.id);

    if (!triageEnabled && owned[0]?.kind === "phrase") {
      await keepFirstVariantOnly(tx, approvedIds);
    }

    return inserted.length;
  });
}
