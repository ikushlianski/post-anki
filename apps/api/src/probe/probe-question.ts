import { z } from "zod";
import { archetypeSchema } from "@post-anki/shared";

export const generatedQuestionSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number().int().nullable(),
  // LRU archetype rotation (issue #36) — only ever requested/read on the
  // first-ever socratic question for a gap (see probe.service.ts's
  // generateQuestion); left undefined by the model on every other call.
  applicableArchetypes: z.array(archetypeSchema).optional(),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
