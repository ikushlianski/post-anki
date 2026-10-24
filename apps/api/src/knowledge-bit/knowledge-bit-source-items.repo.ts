import { and, eq, max, ne } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources } from "../db/schema.js";
import { isSafeSourceUrl } from "@post-anki/core";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import type { SourceItemDraft, SourceItemKind } from "./knowledge-bit-source-item-validation.js";

const VARIANT_KIND_BY_ITEM_KIND = {
  why: "wh_question",
  fill_blank: "fill_in_the_blank",
  basic: "basic",
} as const satisfies Record<SourceItemKind, string>;

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

export interface InsertSourceItemsInput {
  sourceId: string;
  claimedAt: Date;
  firstOrdinal: number;
  items: readonly SourceItemDraft[];
}

// Inserts bits and their variant in one transaction while this run owns the source claim; skips if the source was deleted.
export async function insertSourceItemsForChunk(
  input: InsertSourceItemsInput,
  db: DbExecutor = getDb(),
): Promise<number> {
  const { sourceId, claimedAt, firstOrdinal, items } = input;

  if (items.length === 0) {
    return 0;
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: knowledgeSources.id, sourceUrl: knowledgeSources.sourceUrl })
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
    const itemsByOrdinal = new Map(items.map((item, index) => [firstOrdinal + index, item]));
    const bitRows = [...itemsByOrdinal].map(([ordinal, item]) => ({
      id: newId("kb"),
      knowledgeSourceId: sourceId,
      ordinal,
      body: item.statement,
      background: null,
      sourceLinks,
      approvalState: "pending",
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

      return [
        {
          id: newId("kbqv"),
          knowledgeBitId: bit.id,
          kind: VARIANT_KIND_BY_ITEM_KIND[item.kind],
          order: 0,
          prompt: item.question,
          answer: item.answer,
        },
      ];
    });

    if (variantRows.length > 0) {
      await tx.insert(knowledgeBitQuestionVariants).values(variantRows);
    }

    return inserted.length;
  });
}
