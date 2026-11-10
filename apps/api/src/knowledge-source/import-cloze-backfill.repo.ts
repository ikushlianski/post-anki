import { and, asc, eq, ilike, inArray, isNull, like } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { hasClozeMarkup } from "../knowledge-bit/knowledge-bit-import-facts.js";
import { ANKI_IMPORT_KEY_PREFIX } from "../knowledge-bit/knowledge-source-kind.repo.js";

export interface VerbatimClozeImportCandidate {
  id: string;
  pendingBitIds: string[];
  factText: string;
}

interface SourceBit {
  id: string;
  sourceId: string;
  body: string;
  approvalState: string;
  decidedAt: Date | null;
}

// A verbatim cloze bit still has the old card: its variant sentence is the note text found in the source.
function isVerbatimPending(bit: SourceBit, sentences: readonly string[], rawText: string): boolean {
  return (
    bit.approvalState === "pending" &&
    bit.decidedAt === null &&
    sentences.some((sentence) => rawText.includes(sentence))
  );
}

// A source with a retired card was rebuilt once; its surviving cards are new, so it is never listed again.
export async function listVerbatimClozeImportCandidates(
  options: { limit?: number } = {},
  db: DbExecutor = getDb(),
): Promise<VerbatimClozeImportCandidate[]> {
  const sources = await db
    .select({ id: knowledgeSources.id, rawText: knowledgeSources.rawText })
    .from(knowledgeSources)
    .where(
      and(
        like(knowledgeSources.importKey, `${ANKI_IMPORT_KEY_PREFIX}%`),
        eq(knowledgeSources.status, "bits_detected"),
        ilike(knowledgeSources.rawText, "%{{c%"),
      ),
    )
    .orderBy(asc(knowledgeSources.createdAt), asc(knowledgeSources.id));
  const textBySource = new Map(
    sources.flatMap((source) => (source.rawText && hasClozeMarkup(source.rawText) ? [[source.id, source.rawText] as const] : [])),
  );

  if (textBySource.size === 0) {
    return [];
  }

  const allBits: SourceBit[] = await db
    .select({
      id: knowledgeBits.id,
      sourceId: knowledgeBits.knowledgeSourceId,
      body: knowledgeBits.body,
      approvalState: knowledgeBits.approvalState,
      decidedAt: knowledgeBits.decidedAt,
    })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.knowledgeSourceId, [...textBySource.keys()]));
  const retiredSourceIds = new Set(
    allBits.filter((bit) => bit.approvalState === "superseded").map((bit) => bit.sourceId),
  );
  const bits = allBits.filter((bit) => bit.approvalState !== "superseded" && !retiredSourceIds.has(bit.sourceId));
  const variants =
    bits.length === 0
      ? []
      : await db
          .select({ bitId: knowledgeBitQuestionVariants.knowledgeBitId, sentence: knowledgeBitQuestionVariants.sentence })
          .from(knowledgeBitQuestionVariants)
          .where(
            and(
              inArray(
                knowledgeBitQuestionVariants.knowledgeBitId,
                bits.map((bit) => bit.id),
              ),
              eq(knowledgeBitQuestionVariants.kind, "cloze"),
              isNull(knowledgeBitQuestionVariants.supersededAt),
            ),
          );
  const sentencesByBit = new Map<string, string[]>();

  for (const variant of variants) {
    if (variant.sentence) {
      sentencesByBit.set(variant.bitId, [...(sentencesByBit.get(variant.bitId) ?? []), variant.sentence]);
    }
  }

  const candidates = [...textBySource].flatMap(([sourceId, rawText]) => {
    if (retiredSourceIds.has(sourceId)) {
      return [];
    }

    const pending = bits.filter(
      (bit) => bit.sourceId === sourceId && isVerbatimPending(bit, sentencesByBit.get(bit.id) ?? [], rawText),
    );

    return pending.length > 0
      ? [{ id: sourceId, pendingBitIds: pending.map((bit) => bit.id), factText: pending.map((bit) => bit.body).join("\n\n") }]
      : [];
  });

  return options.limit === undefined ? candidates : candidates.slice(0, options.limit);
}

// Retires only the listed cards that are still untouched pending cards; anything decided since listing stays.
export async function retireVerbatimClozeCards(
  sourceId: string,
  pendingBitIds: readonly string[],
  db: DbExecutor = getDb(),
): Promise<number> {
  if (pendingBitIds.length === 0) {
    return 0;
  }

  const retired = await db
    .update(knowledgeBits)
    .set({ approvalState: "superseded" })
    .where(
      and(
        eq(knowledgeBits.knowledgeSourceId, sourceId),
        eq(knowledgeBits.approvalState, "pending"),
        isNull(knowledgeBits.decidedAt),
        inArray(knowledgeBits.id, [...pendingBitIds]),
      ),
    )
    .returning({ id: knowledgeBits.id });

  return retired.length;
}

// Puts retired undecided cards back to pending and returns the source to its extracted state.
export async function restoreRebuiltCards(
  sourceId: string,
  bitIds: readonly string[],
  db: DbExecutor = getDb(),
): Promise<number> {
  if (bitIds.length === 0) {
    return 0;
  }

  return db.transaction(async (tx) => {
    const restored = await tx
      .update(knowledgeBits)
      .set({ approvalState: "pending" })
      .where(
        and(
          eq(knowledgeBits.knowledgeSourceId, sourceId),
          eq(knowledgeBits.approvalState, "superseded"),
          isNull(knowledgeBits.decidedAt),
          inArray(knowledgeBits.id, [...bitIds]),
        ),
      )
      .returning({ id: knowledgeBits.id });

    if (restored.length > 0) {
      await tx
        .update(knowledgeSources)
        .set({ status: "bits_detected", failureReason: null, nothingExtractedAt: null })
        .where(eq(knowledgeSources.id, sourceId));
    }

    return restored.length;
  });
}
