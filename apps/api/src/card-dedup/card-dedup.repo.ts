import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PendingKnowledgeBitDuplicateOf } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits } from "../db/schema.js";
import type { DuplicateMatch } from "./card-dedup.select.js";

export interface BitAwaitingDedup {
  id: string;
  body: string;
}

export async function listBitsAwaitingDedup(limit: number, db: DbExecutor = getDb()): Promise<BitAwaitingDedup[]> {
  return db
    .select({ id: knowledgeBits.id, body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(and(eq(knowledgeBits.approvalState, "pending"), isNull(knowledgeBits.duplicateCheckedAt)))
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

export async function recordDuplicateCheck(
  bitId: string,
  match: DuplicateMatch | null,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({
      duplicateOfBitId: match?.bitId ?? null,
      duplicateSimilarity: match?.similarity ?? null,
      duplicateReason: match?.reason ?? null,
      similarBitIds: match === null ? null : match.similarBitIds,
      duplicateCheckedAt: new Date(),
    })
    .where(and(eq(knowledgeBits.id, bitId), eq(knowledgeBits.approvalState, "pending")));
}

export interface DuplicateReference {
  bitId: string;
  similarity: number;
  reason: string | null;
  similarBitIds: string[];
}

export async function loadDuplicateOf(
  references: Map<string, DuplicateReference>,
  db: DbExecutor = getDb(),
): Promise<Map<string, PendingKnowledgeBitDuplicateOf>> {
  const targetIds = [...new Set([...references.values()].map((reference) => reference.bitId))];

  if (targetIds.length === 0) {
    return new Map();
  }

  const bits = await db
    .select({ id: knowledgeBits.id, body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, targetIds));
  const variants = await db
    .select({
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(inArray(knowledgeBitQuestionVariants.knowledgeBitId, targetIds), isNull(knowledgeBitQuestionVariants.supersededAt)),
    )
    .orderBy(asc(knowledgeBitQuestionVariants.order));
  const bodyById = new Map(bits.map((bit) => [bit.id, bit.body]));
  const firstVariantById = new Map<string, { prompt: string; answer: string }>();

  for (const variant of variants) {
    if (!firstVariantById.has(variant.knowledgeBitId)) {
      firstVariantById.set(variant.knowledgeBitId, { prompt: variant.prompt, answer: variant.answer });
    }
  }

  const result = new Map<string, PendingKnowledgeBitDuplicateOf>();

  for (const [pendingBitId, reference] of references) {
    const body = bodyById.get(reference.bitId);

    if (body === undefined) {
      continue;
    }

    const variant = firstVariantById.get(reference.bitId);

    result.set(pendingBitId, {
      bitId: reference.bitId,
      front: variant?.prompt ?? body,
      back: variant?.answer ?? null,
      similarity: reference.similarity,
      reason: reference.reason,
      similarBitIds: reference.similarBitIds,
    });
  }

  return result;
}
