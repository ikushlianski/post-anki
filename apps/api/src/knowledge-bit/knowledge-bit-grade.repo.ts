import { desc, eq } from "drizzle-orm";
import { KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitFeedback, knowledgeBits } from "../db/schema.js";
import { recordKnowledgeBitFeedback } from "./knowledge-bit-feedback.repo.js";

export type GradeKnowledgeBitResult =
  | { status: "ok"; feedbackId: string }
  | { status: "not_found" }
  | { status: "not_applicable" };

export async function gradeKnowledgeBit(
  bitId: string,
  input: { rating: number; note?: string | undefined },
  db: DbExecutor = getDb(),
): Promise<GradeKnowledgeBitResult> {
  const bit = (
    await db
      .select({ origin: knowledgeBits.origin })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, bitId))
      .limit(1)
  )[0];

  if (!bit) {
    return { status: "not_found" };
  }

  if (bit.origin === "manual") {
    return { status: "not_applicable" };
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS) : null;

  const existing = (
    await db
      .select({ id: knowledgeBitFeedback.id })
      .from(knowledgeBitFeedback)
      .where(eq(knowledgeBitFeedback.knowledgeBitId, bitId))
      .orderBy(desc(knowledgeBitFeedback.createdAt))
      .limit(1)
  )[0];

  if (existing) {
    await db
      .update(knowledgeBitFeedback)
      .set({ rating: input.rating, note })
      .where(eq(knowledgeBitFeedback.id, existing.id));

    return { status: "ok", feedbackId: existing.id };
  }

  const feedbackId = await recordKnowledgeBitFeedback(db, {
    bitId,
    verdict: "pending",
    rating: input.rating,
    note,
  });

  return feedbackId ? { status: "ok", feedbackId } : { status: "not_found" };
}
