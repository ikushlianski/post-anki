import { z } from "zod";

export const phraseSplitVariantSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  context: z.string().nullable(),
});

export const phraseSplitResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
  variants: z.array(phraseSplitVariantSchema),
});

export type PhraseSplitVariant = z.infer<typeof phraseSplitVariantSchema>;
export type PhraseSplitResponse = z.infer<typeof phraseSplitResponseSchema>;
