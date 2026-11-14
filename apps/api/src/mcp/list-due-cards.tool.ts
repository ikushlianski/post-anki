import { z } from "zod";
import { reviewCardsQuerySchema } from "@post-anki/shared";
import { getKnowledgeBitReviewQueue } from "../knowledge-bit/knowledge-bit-review-queue.repo.js";
import { findExistingSubject } from "./subject-ref.js";

export const listDueCardsInputSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional().describe("Limit to a subject (and its sub-subjects), id or path"),
  limit: z.number().int().min(1).max(50).default(10).describe("Max cards, default 10"),
  tz: reviewCardsQuerySchema.shape.tz.describe("IANA time zone for the study day, default UTC"),
});

const dueCardSchema = z.object({
  variantId: z.string().describe("Pass to grade_card"),
  cardId: z.string(),
  kind: z.string(),
  prompt: z.string(),
  context: z.string().nullable(),
  answer: z.string(),
  phase: z.string(),
  leech: z.boolean(),
  intervalPreviewDays: z.object({ again: z.number(), hard: z.number(), good: z.number(), easy: z.number() }),
});

export const listDueCardsResultSchema = z.object({
  cards: z.array(dueCardSchema),
  counts: z.object({ new: z.number(), learning: z.number(), review: z.number() }),
  nextDueAt: z.string().nullable(),
});

export type ListDueCardsInput = z.input<typeof listDueCardsInputSchema>;
export type ListDueCardsResult = z.infer<typeof listDueCardsResultSchema>;

export async function listDueCards(
  input: ListDueCardsInput,
): Promise<ListDueCardsResult | { error: "invalid_path" | "subject_not_found" }> {
  let subjectId: string | undefined;

  if (input.subject) {
    const subject = await findExistingSubject(input.subject);

    if ("error" in subject) {
      return { error: subject.error === "not_found" ? "subject_not_found" : subject.error };
    }

    subjectId = subject.subjectId;
  }

  const queue = await getKnowledgeBitReviewQueue(
    input.limit ?? 10,
    { subjectId },
    { tz: input.tz ?? "UTC", now: new Date(), aheadDays: 0 },
  );

  return {
    cards: queue.cards.map((card) => ({
      variantId: card.variantId,
      cardId: card.knowledgeBitId,
      kind: card.kind,
      prompt: card.prompt,
      context: card.context ?? null,
      answer: card.answer,
      phase: card.phase,
      leech: card.leech,
      intervalPreviewDays: card.intervalPreview,
    })),
    counts: queue.counts,
    nextDueAt: queue.nextDueAt,
  };
}
