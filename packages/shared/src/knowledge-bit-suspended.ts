import { z } from "zod";
import { cardKeySchema } from "./card-key";

export const suspendedCardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SuspendedCardsQuery = z.infer<typeof suspendedCardsQuerySchema>;

export const suspendedCardReasonSchema = z.enum(["suspended", "leech", "buried"]);

export type SuspendedCardReason = z.infer<typeof suspendedCardReasonSchema>;

export const suspendedCardSchema = z.object({
  knowledgeBitId: z.string(),
  variantId: z.string().optional(),
  cardKey: cardKeySchema.optional(),
  itemText: z.string(),
  context: z.string().nullable().optional(),
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
