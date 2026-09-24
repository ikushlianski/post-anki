import { eq } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind, Verdict } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBitVariantAttempts } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface QuestionVariantForGrading {
  id: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
}

export async function getQuestionVariantById(
  id: string,
  db: DbExecutor = getDb(),
): Promise<QuestionVariantForGrading | null> {
  const rows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
    })
    .from(knowledgeBitQuestionVariants)
    .where(eq(knowledgeBitQuestionVariants.id, id))
    .limit(1);

  const row = rows[0];

  return row ? { ...row, kind: row.kind as KnowledgeBitQuestionVariantKind } : null;
}

export interface VariantAttemptInsertRow {
  variantId: string;
  userAnswer: string;
  score: number;
  verdict: Verdict;
  feedback: string;
}

// Always a fresh insert, never an update — one row per attempt is what lets spaced-repetition
// re-answering accumulate as real history instead of overwriting the last verdict.
export async function insertVariantAttempt(
  row: VariantAttemptInsertRow,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.insert(knowledgeBitVariantAttempts).values({
    id: newId("kbvattempt"),
    variantId: row.variantId,
    userAnswer: row.userAnswer,
    score: row.score,
    verdict: row.verdict,
    feedback: row.feedback,
  });
}
