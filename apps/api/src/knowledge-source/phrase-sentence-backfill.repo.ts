import { and, asc, eq, inArray, isNotNull, isNull, like, ne } from "drizzle-orm";
import { splitPromptContext } from "./phrase-sentence-backfill.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";

export interface PhraseSentenceBackfillCandidate {
  id: string;
  rawTextLength: number;
  pendingBitCount: number;
}

function hasSingleFront(prompts: string[]): boolean {
  return prompts.length > 0 && new Set(prompts).size === 1;
}

export async function listPhraseSentenceBackfillCandidates(
  options: { limit?: number } = {},
  db: DbExecutor = getDb(),
): Promise<PhraseSentenceBackfillCandidate[]> {
  const sources = await db
    .select({ id: knowledgeSources.id, rawText: knowledgeSources.rawText })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.kind, "phrase"),
        eq(knowledgeSources.status, "bits_detected"),
        isNotNull(knowledgeSources.rawText),
      ),
    )
    .orderBy(asc(knowledgeSources.createdAt));

  if (sources.length === 0) {
    return [];
  }

  const sourceIds = sources.map((source) => source.id);
  const liveBits = await db
    .select({
      id: knowledgeBits.id,
      sourceId: knowledgeBits.knowledgeSourceId,
      approvalState: knowledgeBits.approvalState,
    })
    .from(knowledgeBits)
    .where(and(inArray(knowledgeBits.knowledgeSourceId, sourceIds), ne(knowledgeBits.approvalState, "superseded")));
  const variantRows = await db
    .select({ bitId: knowledgeBitQuestionVariants.knowledgeBitId, prompt: knowledgeBitQuestionVariants.prompt })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          liveBits.map((bit) => bit.id),
        ),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );
  const promptsByBit = new Map<string, string[]>();

  for (const row of variantRows) {
    promptsByBit.set(row.bitId, [...(promptsByBit.get(row.bitId) ?? []), row.prompt]);
  }

  const bitsBySource = new Map<string, typeof liveBits>();

  for (const bit of liveBits) {
    bitsBySource.set(bit.sourceId, [...(bitsBySource.get(bit.sourceId) ?? []), bit]);
  }

  const candidates = sources.flatMap((source) => {
    const bits = bitsBySource.get(source.id) ?? [];
    const eligible =
      bits.length > 0 &&
      bits.every((bit) => bit.approvalState === "pending" && hasSingleFront(promptsByBit.get(bit.id) ?? []));

    return eligible
      ? [{ id: source.id, rawTextLength: source.rawText?.length ?? 0, pendingBitCount: bits.length }]
      : [];
  });

  return options.limit === undefined ? candidates : candidates.slice(0, options.limit);
}

export interface PhraseContextSplit {
  variantId: string;
  bitId: string;
  prompt: string;
  context: string;
}

export async function listPhraseContextSplits(
  db: DbExecutor = getDb(),
  bitId?: string,
): Promise<PhraseContextSplit[]> {
  const rows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      bitId: knowledgeBitQuestionVariants.knowledgeBitId,
      prompt: knowledgeBitQuestionVariants.prompt,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        eq(knowledgeSources.kind, "phrase"),
        ne(knowledgeBits.approvalState, "superseded"),
        isNull(knowledgeBitQuestionVariants.supersededAt),
        isNull(knowledgeBitQuestionVariants.context),
        like(knowledgeBitQuestionVariants.prompt, "%\n%"),
        bitId === undefined ? undefined : eq(knowledgeBitQuestionVariants.knowledgeBitId, bitId),
      ),
    );

  return rows.flatMap((row) => {
    const split = splitPromptContext(row.prompt);

    return split ? [{ variantId: row.id, bitId: row.bitId, ...split }] : [];
  });
}

export async function applyPhraseContextSplits(
  splits: readonly PhraseContextSplit[],
  db: DbExecutor = getDb(),
): Promise<number> {
  let updated = 0;

  for (const split of splits) {
    const result = await db
      .update(knowledgeBitQuestionVariants)
      .set({ prompt: split.prompt, context: split.context })
      .where(
        and(
          eq(knowledgeBitQuestionVariants.id, split.variantId),
          isNull(knowledgeBitQuestionVariants.context),
        ),
      )
      .returning({ id: knowledgeBitQuestionVariants.id });

    updated += result.length;
  }

  return updated;
}
