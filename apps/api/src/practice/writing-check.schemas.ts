import { z } from "zod";
import { verdictSchema } from "@post-anki/shared";

export const writingCheckAgentSchema = z.object({
  score: z.number().int().min(0).max(10),
  verdict: verdictSchema,
  feedback: z.string(),
  nativeAlternatives: z.array(z.string()).min(1).max(2),
});

export type WritingCheckAgentResult = z.infer<typeof writingCheckAgentSchema>;
