import { z } from "zod";
import { TYPED_ANSWER_MAX_CHARS } from "./text-limits";
import { questionKindSchema } from "./question";

export const recordAttemptInput = z.object({
  topicId: z.string(),
  questionId: z.string(),
  mode: questionKindSchema,
  answer: z.string().max(TYPED_ANSWER_MAX_CHARS),
  selfOutcome: z.enum(["pass", "fail"]).optional(),
});

export type RecordAttemptInput = z.infer<typeof recordAttemptInput>;

export const attemptResultSchema = z.object({
  outcome: z.enum(["pass", "fail"]),
  correctAnswerIndex: z.number().int().optional(),
  feedback: z.string(),
});

export type AttemptResult = z.infer<typeof attemptResultSchema>;
