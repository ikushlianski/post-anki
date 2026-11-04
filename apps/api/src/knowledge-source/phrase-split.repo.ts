import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { PhraseSplitVariant } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";

export async function isLivePhraseKnowledgeBit(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ id: knowledgeBits.id })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeSources.kind, "phrase"), ne(knowledgeBits.approvalState, "superseded")))
    .limit(1);

  return row !== undefined;
}

export async function listPhraseBitVariants(bitId: string, db: DbExecutor = getDb()): Promise<PhraseSplitVariant[]> {
  return db
    .select({
      id: knowledgeBitQuestionVariants.id,
      prompt: knowledgeBitQuestionVariants.prompt,
      context: knowledgeBitQuestionVariants.context,
    })
    .from(knowledgeBitQuestionVariants)
    .where(and(eq(knowledgeBitQuestionVariants.knowledgeBitId, bitId), isNull(knowledgeBitQuestionVariants.supersededAt)))
    .orderBy(asc(knowledgeBitQuestionVariants.createdAt), asc(knowledgeBitQuestionVariants.id));
}
