import { z } from "zod";
import { domainSchema, verdictSchema } from "@post-anki/shared";

export const phraseBatchSchema = z.object({
  phrases: z
    .array(
      z.object({
        russian: z.string(),
        referenceEnglish: z.string(),
        domain: domainSchema,
      }),
    )
    .min(1),
});

export type PhraseBatch = z.infer<typeof phraseBatchSchema>;

export const gradeBatchSchema = z.object({
  gradedAnswers: z
    .array(
      z.object({
        score: z.number().int().min(0).max(10),
        verdict: verdictSchema,
        feedback: z.string(),
        nativeAlternatives: z.array(z.string()),
      }),
    )
    .min(1),
});

export type GradeBatch = z.infer<typeof gradeBatchSchema>;
