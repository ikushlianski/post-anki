import { z } from "zod";
import { questionKindSchema } from "./question";

export const recordAttemptInput = z.object({
  topicId: z.string(),
  questionId: z.string(),
  mode: questionKindSchema,
  answer: z.string(),
  selfOutcome: z.enum(["pass", "fail"]).optional(),
});

export type RecordAttemptInput = z.infer<typeof recordAttemptInput>;

export const attemptResultSchema = z.object({
  outcome: z.enum(["pass", "fail"]),
  correctAnswerIndex: z.number().int().optional(),
  feedback: z.string(),
});

export type AttemptResult = z.infer<typeof attemptResultSchema>;
