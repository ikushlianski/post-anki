import { z } from "zod";
import { knowledgeBitFeedbackReasonSchema } from "./knowledge-bit-review-feedback";

export const rejectedCardsQuerySchema = z.object({
  reason: knowledgeBitFeedbackReasonSchema.optional(),
  subjectId: z.string().trim().min(1).max(200).optional(),
  q: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type RejectedCardsQuery = z.infer<typeof rejectedCardsQuerySchema>;

export const rejectedCardSchema = z.object({
  knowledgeBitId: z.string(),
  body: z.string(),
  reasonCode: knowledgeBitFeedbackReasonSchema,
  decidedAt: z.string(),
  note: z.string().nullable().optional(),
  sourceTitle: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
});

export type RejectedCard = z.infer<typeof rejectedCardSchema>;

export const rejectedCardsPageSchema = z.object({
  items: z.array(rejectedCardSchema),
  hasMore: z.boolean(),
  reasonCounts: z.record(z.string(), z.number().int().min(0)).optional(),
});

export type RejectedCardsPage = z.infer<typeof rejectedCardsPageSchema>;
