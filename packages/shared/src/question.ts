import { z } from "zod";

export const questionKindSchema = z.enum(["socratic", "quick_test"]);

export type QuestionKind = z.infer<typeof questionKindSchema>;

export const questionSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  kind: questionKindSchema,
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswerIndex: z.number().int().optional(),
});

export type Question = z.infer<typeof questionSchema>;
