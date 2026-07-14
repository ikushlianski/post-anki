import { z } from "zod";
import { questionKindSchema } from "./question";
import { topicProgressSchema } from "./progress";
import { learningStatusSchema } from "./learning-status";

export const probeQuestionSchema = z.object({
  gapId: z.string().nullable(),
  gapLabel: z.string().nullable(),
  kind: questionKindSchema,
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  correctAnswerIndex: z.number().int().nullable().optional(),
});

export type ProbeQuestion = z.infer<typeof probeQuestionSchema>;

export const startProbeInput = z.object({
  topicId: z.string(),
  mode: questionKindSchema,
});

export type StartProbeInput = z.infer<typeof startProbeInput>;

export const submitProbeInput = z.object({
  topicId: z.string(),
  gapId: z.string().nullable(),
  mode: questionKindSchema,
  answer: z.string(),
  selfOutcome: z.enum(["pass", "fail"]).optional(),
});

export type SubmitProbeInput = z.infer<typeof submitProbeInput>;

export const probeResultSchema = z.object({
  outcome: z.enum(["pass", "fail"]),
  coveredGapLabels: z.array(z.string()),
  feedback: z.string(),
  progress: topicProgressSchema,
  learningStatus: learningStatusSchema,
  nextQuestion: probeQuestionSchema.nullable(),
});

export type ProbeResult = z.infer<typeof probeResultSchema>;
