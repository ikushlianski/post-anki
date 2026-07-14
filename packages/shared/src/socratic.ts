import { z } from "zod";

export const socraticDegreeSchema = z.enum([
  "correct",
  "slightly_wrong",
  "mostly_wrong",
]);

export type SocraticDegree = z.infer<typeof socraticDegreeSchema>;

export const socraticActionSchema = z.enum([
  "advance",
  "point_out",
  "explain_hint",
  "give_answer",
]);

export type SocraticAction = z.infer<typeof socraticActionSchema>;

export const socraticSessionStatusSchema = z.enum(["active", "completed"]);

export type SocraticSessionStatus = z.infer<typeof socraticSessionStatusSchema>;

export const socraticTurnSchema = z.object({
  id: z.string(),
  gapId: z.string().nullable(),
  conceptLabel: z.string(),
  prompt: z.string(),
  order: z.number().int(),
});

export type SocraticTurn = z.infer<typeof socraticTurnSchema>;

export const socraticSessionSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  curriculumId: z.string(),
  status: socraticSessionStatusSchema,
  current: socraticTurnSchema.nullable(),
  conceptsTotal: z.number().int(),
  conceptsCovered: z.number().int(),
  topicMaturity: z.number().int(),
});

export type SocraticSession = z.infer<typeof socraticSessionSchema>;

export const startSocraticSessionInput = z.object({
  topicId: z.string(),
  regenerate: z.boolean().optional(),
});

export type StartSocraticSessionInput = z.infer<typeof startSocraticSessionInput>;

export const answerSocraticInput = z.object({
  sessionId: z.string(),
  turnId: z.string(),
  answer: z.string().min(1),
});

export type AnswerSocraticInput = z.infer<typeof answerSocraticInput>;

export const answerSocraticResultSchema = z.object({
  action: socraticActionSchema,
  degree: socraticDegreeSchema,
  feedback: z.string(),
  conceptLabel: z.string(),
  covered: z.boolean(),
  next: socraticTurnSchema.nullable(),
  status: socraticSessionStatusSchema,
  conceptsCovered: z.number().int(),
  conceptsTotal: z.number().int(),
  topicMaturity: z.number().int(),
});

export type AnswerSocraticResult = z.infer<typeof answerSocraticResultSchema>;

export const socraticEvalSchema = z.object({
  degree: socraticDegreeSchema,
  pointOut: z.string(),
  explanation: z.string(),
  correctAnswer: z.string(),
});

export type SocraticEval = z.infer<typeof socraticEvalSchema>;
