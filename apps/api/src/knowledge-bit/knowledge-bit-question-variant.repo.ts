import { and, asc, eq, isNull } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type Db, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface KnowledgeBitForQuestionGenerationScan {
  id: string;
  body: string;
}

export async function listKnowledgeBitsForQuestionGenerationScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForQuestionGenerationScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(
      and(
        isNull(knowledgeBits.whQuestionGeneratedAt),
        isNull(knowledgeBits.whQuestionGenerationFailedAt),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

export async function insertQuestionVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.insert(knowledgeBitQuestionVariants).values({
    id: newId("kbqv"),
    knowledgeBitId,
    kind,
    order,
    prompt,
    answer,
  });
}

export async function markWhQuestionGenerated(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ whQuestionGeneratedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

// Insert + mark share one db.transaction so a mark-write failure after a successful insert can
// never leave a variant row orphaned on a bit the next scan would otherwise re-pick-up — the
// unique index on (knowledge_bit_id, kind, order) also guards a second, concurrent scan.
export async function recordGeneratedQuestionVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertQuestionVariant(knowledgeBitId, kind, order, prompt, answer, tx);
    await markWhQuestionGenerated(knowledgeBitId, tx);
  });
}

export async function markWhQuestionGenerationFailed(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ whQuestionGenerationFailedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

export async function listKnowledgeBitsForFillBlankGenerationScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForQuestionGenerationScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(
      and(
        isNull(knowledgeBits.fillBlankGeneratedAt),
        isNull(knowledgeBits.fillBlankGenerationFailedAt),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

export async function markFillBlankGenerated(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ fillBlankGeneratedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

export async function markFillBlankGenerationFailed(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ fillBlankGenerationFailedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

// Same atomicity guarantee as recordGeneratedQuestionVariant, mirrored for the independent
// fill_in_the_blank generation pass over the same bits.
export async function recordGeneratedFillBlankVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertQuestionVariant(knowledgeBitId, kind, order, prompt, answer, tx);
    await markFillBlankGenerated(knowledgeBitId, tx);
  });
}

export interface QuestionVariantForEmbeddingScan {
  id: string;
  prompt: string;
  answer: string;
  embeddingHash: string | null;
}

export async function listQuestionVariantsForEmbeddingScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<QuestionVariantForEmbeddingScan[]> {
  return db
    .select({
      id: knowledgeBitQuestionVariants.id,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      embeddingHash: knowledgeBitQuestionVariants.embeddingHash,
    })
    .from(knowledgeBitQuestionVariants)
    .where(isNull(knowledgeBitQuestionVariants.embeddedAt))
    .orderBy(asc(knowledgeBitQuestionVariants.createdAt))
    .limit(limit);
}

export async function updateQuestionVariantEmbedding(
  id: string,
  embedding: number[],
  embeddingHash: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBitQuestionVariants)
    .set({ embedding, embeddingHash, embeddedAt: new Date() })
    .where(eq(knowledgeBitQuestionVariants.id, id));
}
