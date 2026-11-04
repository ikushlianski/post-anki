import type { ReviewGrade, Verdict } from "@post-anki/shared";
import { knowledgeBitVariantAttempts } from "../db/schema.js";
import type { Tx } from "../shared/merge-lock.js";
import { newId } from "../shared/id.js";

const REHEARSAL_SCORE: Record<ReviewGrade, number> = { again: 2, hard: 5, good: 8, easy: 10 };

export function rehearsalVerdict(grade: ReviewGrade): Verdict {
  return grade === "good" || grade === "easy" ? "Ok" : "NeedsReview";
}

// A requestId makes the attempt id deterministic, so a retried rehearsal inserts nothing new.
export async function insertRehearsalAttemptInTx(
  tx: Tx,
  input: { variantId: string; grade: ReviewGrade; requestId?: string; createdAt: Date },
): Promise<string> {
  const id = input.requestId ? `kbvattempt_${input.requestId}` : newId("kbvattempt");

  await tx
    .insert(knowledgeBitVariantAttempts)
    .values({
      id,
      variantId: input.variantId,
      userAnswer: "",
      score: REHEARSAL_SCORE[input.grade],
      verdict: rehearsalVerdict(input.grade),
      feedback: "rehearsal",
      createdAt: input.createdAt,
    })
    .onConflictDoNothing({ target: knowledgeBitVariantAttempts.id });

  return id;
}
