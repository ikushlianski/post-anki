import { z } from "zod";
import { depthLevelSchema } from "./depth";

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
  "move_on",
  "retry",
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
  answer: z.string(),
});

export type AnswerSocraticInput = z.infer<typeof answerSocraticInput>;

// Session summary (issue #27). The gap-shaped fields (mostRecentGap,
// gapsLoggedCount, crossCuttingConcerns) are real, typed fields — but
// structurally constant at their empty value in this story: the Socratic
// answer path never calls insertDiscoveredGaps (it only covers existing
// gaps, it never discovers new ones), so there is currently no source of
// truth for "a gap was logged this session." See spec.md Decision 1 in
// .planning/27-session-end-summary — this is disclosed, not a bug, and not
// a redefinition of "gap logged" to mean "a turn that didn't advance"
// (explicitly rejected, since that would infer a #28-style gap without the
// explicit user consent #28 requires).
export const socraticSessionSummarySchema = z.object({
  topicTitle: z.string(),
  depth: depthLevelSchema,
  solidConcepts: z.array(z.string()),
  mostRecentGap: z.object({ gapId: z.string(), label: z.string() }).nullable(),
  gapsLoggedCount: z.number().int(),
  crossCuttingConcerns: z.array(z.string()),
  exchangeCount: z.number().int(),
  topicMaturity: z.number().int(),
});

export type SocraticSessionSummary = z.infer<typeof socraticSessionSummarySchema>;

export const answerSocraticResultSchema = z.object({
  action: socraticActionSchema,
  degree: socraticDegreeSchema.nullable(),
  feedback: z.string(),
  conceptLabel: z.string(),
  covered: z.boolean(),
  next: socraticTurnSchema.nullable(),
  status: socraticSessionStatusSchema,
  conceptsCovered: z.number().int(),
  conceptsTotal: z.number().int(),
  topicMaturity: z.number().int(),
  // Soft checkpoint at 5+ exchanges (issue #27) — does not end the session.
  checkpointReached: z.boolean(),
  // Populated only when checkpointReached is true; null otherwise. Carries
  // the same session-summary shape the hard-end summary uses (Decision 4),
  // so the bot can render the checkpoint message without a second round
  // trip.
  checkpointSummary: socraticSessionSummarySchema.nullable(),
});

export type AnswerSocraticResult = z.infer<typeof answerSocraticResultSchema>;

export const checkSessionIdleResultSchema = z.object({
  idle: z.boolean(),
  summary: socraticSessionSummarySchema.nullable().optional(),
});

export type CheckSessionIdleResult = z.infer<typeof checkSessionIdleResultSchema>;

export const completeSocraticSessionResultSchema = z.object({
  completed: z.boolean(),
  summary: socraticSessionSummarySchema.nullable(),
});

export type CompleteSocraticSessionResult = z.infer<
  typeof completeSocraticSessionResultSchema
>;

export const socraticEvalSchema = z.object({
  degree: socraticDegreeSchema,
  whatWasRight: z.string(),
  pointOut: z.string(),
  explanation: z.string(),
  correctAnswer: z.string(),
});

export type SocraticEval = z.infer<typeof socraticEvalSchema>;
