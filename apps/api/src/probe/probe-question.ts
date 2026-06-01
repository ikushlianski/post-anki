import { z } from "zod";

export const generatedQuestionSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number().int().nullable(),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
