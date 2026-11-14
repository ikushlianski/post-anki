import { z } from "zod";

export const DUPLICATE_FRONT_SIMILARITY = 0.8;
export const DUPLICATE_PAIR_SIMILARITY = 0.92;

export const duplicateMatchSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  subject: z.object({ id: z.string(), name: z.string() }).nullable(),
  similarity: z.number().nullable(),
  matchKind: z.enum(["literal", "semantic"]),
  kind: z.enum(["duplicate", "possible_duplicate"]),
});

export type DuplicateMatch = z.infer<typeof duplicateMatchSchema>;

export const duplicateCheckSchema = z.object({
  matches: z.array(duplicateMatchSchema),
  semanticChecked: z.boolean(),
});

export type DuplicateCheck = z.infer<typeof duplicateCheckSchema>;
