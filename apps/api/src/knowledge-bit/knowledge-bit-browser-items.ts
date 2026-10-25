import { and, count, inArray, isNull } from "drizzle-orm";
import type {
  KnowledgeBitBrowserItem,
  KnowledgeBitBrowserOrigin,
  KnowledgeBitQuestionVariantKind,
} from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits } from "../db/schema.js";
import { deriveBrowserSourceLabel } from "./knowledge-bit-browser-source-label.js";
import { pickPreferredVariants } from "./knowledge-bit-preferred-variant.js";
import { ANKI_VARIANT_KIND_PREFERENCE } from "./knowledge-bit-variant-kind-rules.js";

export interface BrowserPageRow {
  id: string;
  origin: KnowledgeBitBrowserOrigin;
  createdAt: Date;
  sourceUrl: string | null;
  sourceId: string | null;
  sourceText: string | null;
}

function kindRank(kind: string): number {
  const index = (ANKI_VARIANT_KIND_PREFERENCE as readonly string[]).indexOf(kind);

  return index === -1 ? ANKI_VARIANT_KIND_PREFERENCE.length : index;
}

async function countSourcePieces(
  sourceIds: string[],
  db: DbExecutor,
): Promise<Map<string, number>> {
  if (sourceIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ sourceId: knowledgeBits.knowledgeSourceId, pieces: count() })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.knowledgeSourceId, sourceIds))
    .groupBy(knowledgeBits.knowledgeSourceId);

  return new Map(rows.map((row) => [row.sourceId, row.pieces]));
}

export async function assembleBrowserItems(
  pageRows: readonly BrowserPageRow[],
  db: DbExecutor,
): Promise<KnowledgeBitBrowserItem[]> {
  if (pageRows.length === 0) {
    return [];
  }

  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      createdAt: knowledgeBitQuestionVariants.createdAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          pageRows.map((row) => row.id),
        ),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  const preferred = pickPreferredVariants(variantRows);
  const pieceCounts = await countSourcePieces(
    [...new Set(pageRows.flatMap((row) => (row.sourceId ? [row.sourceId] : [])))],
    db,
  );

  return pageRows.flatMap((row) => {
    const answer = preferred.get(row.id)?.answer;
    const phrasings = variantRows
      .filter((variant) => variant.knowledgeBitId === row.id)
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.order - b.order)
      .map((variant) => ({
        id: variant.id,
        kind: variant.kind as KnowledgeBitQuestionVariantKind,
        prompt: variant.prompt,
      }));

    if (answer === undefined || phrasings.length === 0) {
      return [];
    }

    return [
      {
        knowledgeBitId: row.id,
        phrasings,
        answer,
        origin: row.origin,
        sourceId: row.sourceId,
        sourceUrl: row.sourceUrl,
        sourceLabel: deriveBrowserSourceLabel({ sourceUrl: row.sourceUrl, rawText: row.sourceText }),
        addedAt: row.createdAt.toISOString(),
        sourcePieceCount: row.sourceId ? (pieceCounts.get(row.sourceId) ?? 0) : 0,
      },
    ];
  });
}
