import { and, eq, exists, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits } from "../db/schema.js";
import { escapeLikePattern } from "../shared/escape-like-pattern.js";

export function containsPattern(words: string): string {
  return `%${escapeLikePattern(words)}%`;
}

function someLivePhrasing(db: DbExecutor, condition: SQL | undefined) {
  return exists(
    db
      .select({ one: knowledgeBitQuestionVariants.id })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
          condition,
        ),
      ),
  );
}

export function questionOrAnswerContains(pattern: string, db: DbExecutor) {
  return someLivePhrasing(
    db,
    or(
      ilike(knowledgeBitQuestionVariants.prompt, pattern),
      ilike(knowledgeBitQuestionVariants.answer, pattern),
    ),
  );
}

export function questionContains(pattern: string, db: DbExecutor) {
  return someLivePhrasing(db, ilike(knowledgeBitQuestionVariants.prompt, pattern));
}

export function answerContains(pattern: string, db: DbExecutor) {
  return someLivePhrasing(db, ilike(knowledgeBitQuestionVariants.answer, pattern));
}
