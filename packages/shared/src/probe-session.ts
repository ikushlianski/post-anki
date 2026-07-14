import { z } from "zod";

export const probeScopeSchema = z.enum(["module", "topic"]);

export type ProbeScope = z.infer<typeof probeScopeSchema>;

export const probeDifficultySchema = z.enum(["easy", "medium", "hard"]);

export type ProbeDifficulty = z.infer<typeof probeDifficultySchema>;

export const probeFormatSchema = z.enum(["true_false", "mcq"]);

export type ProbeFormat = z.infer<typeof probeFormatSchema>;

export const probeOutcomeSchema = z.enum(["pass", "fail"]);

export type ProbeOutcome = z.infer<typeof probeOutcomeSchema>;

export const probeSessionStatusSchema = z.enum(["active", "completed"]);

export type ProbeSessionStatus = z.infer<typeof probeSessionStatusSchema>;

export const probeSessionQuestionSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  topicId: z.string().nullable(),
  gapId: z.string().nullable(),
  prompt: z.string(),
  options: z.array(z.string()),
  difficulty: probeDifficultySchema,
  format: probeFormatSchema,
  answeredIndex: z.number().int().nullable(),
  outcome: probeOutcomeSchema.nullable(),
  correctAnswerIndex: z.number().int().nullable(),
});

export type ProbeSessionQuestion = z.infer<typeof probeSessionQuestionSchema>;

export const probeSessionSchema = z.object({
  id: z.string(),
  scope: probeScopeSchema,
  scopeId: z.string(),
  curriculumId: z.string(),
  status: probeSessionStatusSchema,
  total: z.number().int(),
  correct: z.number().int(),
  answered: z.number().int(),
  questions: z.array(probeSessionQuestionSchema),
});

export type ProbeSession = z.infer<typeof probeSessionSchema>;

export const prepareProbeSessionInput = z.object({
  scope: probeScopeSchema,
  scopeId: z.string(),
  regenerate: z.boolean().optional(),
});

export type PrepareProbeSessionInput = z.infer<typeof prepareProbeSessionInput>;

export const answerProbeSessionInput = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  selectedIndex: z.number().int(),
});

export type AnswerProbeSessionInput = z.infer<typeof answerProbeSessionInput>;

export const answerProbeSessionResultSchema = z.object({
  questionId: z.string(),
  outcome: probeOutcomeSchema,
  correctAnswerIndex: z.number().int(),
  correct: z.number().int(),
  answered: z.number().int(),
  total: z.number().int(),
  status: probeSessionStatusSchema,
  coveredGapLabels: z.array(z.string()),
});

export type AnswerProbeSessionResult = z.infer<
  typeof answerProbeSessionResultSchema
>;

export const generatedProbeQuestionSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number().int(),
  difficulty: probeDifficultySchema,
  format: probeFormatSchema,
  gapLabel: z.string().nullable(),
  topicTitle: z.string().nullable(),
});

export type GeneratedProbeQuestion = z.infer<
  typeof generatedProbeQuestionSchema
>;

export const generatedProbeBatchSchema = z.object({
  questions: z.array(generatedProbeQuestionSchema),
});

export type GeneratedProbeBatch = z.infer<typeof generatedProbeBatchSchema>;
