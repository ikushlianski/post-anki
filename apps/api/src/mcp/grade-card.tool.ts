import { z } from "zod";
import { recordReviewInputSchema, reviewGradeSchema } from "@post-anki/shared";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { recordKnowledgeBitReview } from "../knowledge-bit/knowledge-bit-review.orchestrator.js";
import { log } from "../shared/log.js";
import { recordActivityToday } from "../streak/streak.service.js";
import { hasCardWriteScope } from "./card-write-scope.js";

export const gradeCardInputSchema = z.object({
  variantId: z.string().min(1).describe("Card variant id from list_due_cards"),
  grade: reviewGradeSchema.describe("again, hard, good or easy"),
  tz: recordReviewInputSchema.shape.tz.describe("IANA time zone for the study day, default UTC"),
});

export const gradeCardResultSchema = z.object({
  cardId: z.string(),
  phase: z.string(),
  dueAt: z.string(),
  intervalDays: z.number(),
  lapses: z.number().int(),
  leech: z.boolean(),
  suspended: z.boolean(),
});

export type GradeCardInput = z.infer<typeof gradeCardInputSchema>;
export type GradeCardResult = z.infer<typeof gradeCardResultSchema>;
export type GradeCardOutcome = GradeCardResult | { error: "missing_scope" | "variant_not_found" | "not_approved" };

// Same service as POST /knowledge-bits/reviews: schedules the card and counts the day's activity.
export async function gradeCard(
  input: GradeCardInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<GradeCardOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const now = new Date();
  const outcome = await recordKnowledgeBitReview(
    { variantId: input.variantId, grade: input.grade, tz: input.tz, burySiblings: true },
    now,
  );

  if (!outcome.ok) {
    return { error: outcome.error };
  }

  if (!outcome.superseded) {
    try {
      await recordActivityToday(now.toISOString(), "review");
    } catch (error) {
      log.warn({ error }, "record_activity_after_review_failed");
    }
  }

  return {
    cardId: outcome.knowledgeBitId,
    phase: outcome.phase,
    dueAt: outcome.dueAt,
    intervalDays: outcome.intervalDays,
    lapses: outcome.lapses,
    leech: outcome.leech,
    suspended: outcome.suspended,
  };
}
