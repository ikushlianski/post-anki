import { and, asc, eq } from "drizzle-orm";
import type { KnowledgeBitFeedbackVerdict } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitFeedback } from "../db/schema.js";
import { recordKnowledgeBitFeedback } from "./knowledge-bit-feedback.repo.js";

export async function recordKnowledgeBitDecision(
  db: DbExecutor,
  input: {
    bitId: string;
    verdict: KnowledgeBitFeedbackVerdict;
    rating?: number;
    note?: string | null;
  },
): Promise<string | null> {
  const pending = (
    await db
      .select({ id: knowledgeBitFeedback.id })
      .from(knowledgeBitFeedback)
      .where(
        and(
          eq(knowledgeBitFeedback.knowledgeBitId, input.bitId),
          eq(knowledgeBitFeedback.verdict, "pending"),
        ),
      )
      .orderBy(asc(knowledgeBitFeedback.createdAt))
      .limit(1)
  )[0];

  if (!pending) {
    return recordKnowledgeBitFeedback(db, input);
  }

  const patch: Partial<typeof knowledgeBitFeedback.$inferInsert> = {
    verdict: input.verdict,
    reasonCode: input.verdict === "rejected" ? "unspecified" : null,
  };

  if (input.rating !== undefined) {
    patch.rating = input.rating;
  }

  if (input.note !== undefined) {
    patch.note = input.note;
  }

  await db.update(knowledgeBitFeedback).set(patch).where(eq(knowledgeBitFeedback.id, pending.id));

  return pending.id;
}
