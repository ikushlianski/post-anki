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
