import { z } from "zod";

export const probeScopeSchema = z.enum(["module", "topic", "tag"]);

export type ProbeScope = z.infer<typeof probeScopeSchema>;

export const probeDifficultySchema = z.enum(["easy", "medium", "hard"]);

export type ProbeDifficulty = z.infer<typeof probeDifficultySchema>;

export const probeFormatSchema = z.enum(["true_false", "mcq"]);

export type ProbeFormat = z.infer<typeof probeFormatSchema>;

export const probeOutcomeSchema = z.enum(["pass", "fail"]);

export type ProbeOutcome = z.infer<typeof probeOutcomeSchema>;

export const probeSessionStatusSchema = z.enum(["active", "completed"]);

export type ProbeSessionStatus = z.infer<typeof probeSessionStatusSchema>;

export const probeQuestionTypeSchema = z.enum(["single", "multi"]);

export type ProbeQuestionType = z.infer<typeof probeQuestionTypeSchema>;

export const optionExplanationSchema = z.object({
  text: z.string(),
  citationUrl: z.string().nullable(),
});

export type OptionExplanation = z.infer<typeof optionExplanationSchema>;

export const probeSessionQuestionSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  topicId: z.string().nullable(),
  gapId: z.string().nullable(),
  prompt: z.string(),
  options: z.array(z.string()),
  difficulty: probeDifficultySchema,
  format: probeFormatSchema,
  type: probeQuestionTypeSchema,
  answeredIndex: z.number().int().nullable(),
  answeredIndexes: z.array(z.number().int()).nullable(),
  outcome: probeOutcomeSchema.nullable(),
  correctAnswerIndex: z.number().int().nullable(),
  correctAnswerIndexes: z.array(z.number().int()).nullable(),
  optionExplanations: z.array(optionExplanationSchema).nullable(),
});

export type ProbeSessionQuestion = z.infer<typeof probeSessionQuestionSchema>;

export const probeSessionSchema = z.object({
  id: z.string(),
  scope: probeScopeSchema,
  scopeId: z.string(),
  curriculumId: z.string().nullable(),
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
  allowMultiSelect: z.boolean().optional(),
});

export type PrepareProbeSessionInput = z.infer<typeof prepareProbeSessionInput>;

export const answerProbeSessionInput = z.object({
  sessionId: z.string(),
  questionId: z.string(),
  selectedIndex: z.number().int().optional(),
  selectedIndices: z.array(z.number().int()).optional(),
});

export type AnswerProbeSessionInput = z.infer<typeof answerProbeSessionInput>;

// Generalized recall-gap mastery tracking (issue #57) — present only when
// this answer touched a mastery-tracked gap (an existing gapId, or a
// gapLabel that matched/created one). `justMastered` is what
// probe-session-quiz.tsx uses to render the "✓ Resolved: <label>"
// acknowledgment distinctly from ordinary "correct, still practicing (n/3)"
// feedback — never on the first correct, only on the transition that
// actually reaches mastered (spec.md's "resolved lie" regression guard).
export const answerProbeSessionGapMasteryResultSchema = z.object({
  gapId: z.string(),
  label: z.string(),
  status: z.enum(["new", "practicing", "struggling", "mastered"]),
  masteryStage: z.number().int(),
  justMastered: z.boolean(),
});

export type AnswerProbeSessionGapMasteryResult = z.infer<
  typeof answerProbeSessionGapMasteryResultSchema
>;

export const answerProbeSessionResultSchema = z.object({
  questionId: z.string(),
  outcome: probeOutcomeSchema,
  correctAnswerIndex: z.number().int(),
  correctAnswerIndexes: z.array(z.number().int()).nullable(),
  correct: z.number().int(),
  answered: z.number().int(),
  total: z.number().int(),
  status: probeSessionStatusSchema,
  coveredGapLabels: z.array(z.string()),
  optionExplanations: z.array(optionExplanationSchema).nullable(),
  gapMastery: answerProbeSessionGapMasteryResultSchema.nullable(),
});

export type AnswerProbeSessionResult = z.infer<
  typeof answerProbeSessionResultSchema
>;

export const generatedProbeQuestionSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number().int(),
  correctAnswerIndexes: z.array(z.number().int()).nullable(),
  type: probeQuestionTypeSchema.nullable(),
  difficulty: probeDifficultySchema,
  format: probeFormatSchema,
  gapLabel: z.string().nullable(),
  topicTitle: z.string().nullable(),
  optionExplanations: z.array(optionExplanationSchema).nullable(),
});

export type GeneratedProbeQuestion = z.infer<
  typeof generatedProbeQuestionSchema
>;

export const generatedProbeBatchSchema = z.object({
  questions: z.array(generatedProbeQuestionSchema),
});

export type GeneratedProbeBatch = z.infer<typeof generatedProbeBatchSchema>;
