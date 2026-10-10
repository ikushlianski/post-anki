import { z } from "zod";

export const suspendedCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SuspendedCardsQuery = z.infer<typeof suspendedCardsQuerySchema>;

export const suspendedCardReasonSchema = z.enum(["suspended", "leech", "buried"]);

export type SuspendedCardReason = z.infer<typeof suspendedCardReasonSchema>;

export const suspendedCardSchema = z.object({
  knowledgeBitId: z.string(),
  itemText: z.string(),
  question: z.string(),
  answer: z.string(),
  subjectName: z.string().nullable(),
  reason: suspendedCardReasonSchema,
  lapses: z.number().int().min(0),
  suspended: z.boolean(),
  buriedUntil: z.string().nullable(),
  since: z.string().nullable(),
});

export type SuspendedCard = z.infer<typeof suspendedCardSchema>;

export const suspendedCardsPageSchema = z.object({
  items: z.array(suspendedCardSchema),
  hasMore: z.boolean(),
});

export type SuspendedCardsPage = z.infer<typeof suspendedCardsPageSchema>;
