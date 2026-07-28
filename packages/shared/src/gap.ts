import { z } from "zod";
import { depthLevelSchema } from "./depth";
import { concernSchema } from "./concern";

export const gapOriginSchema = z.enum(["ai", "user"]);

export type GapOrigin = z.infer<typeof gapOriginSchema>;

export const gapStateSchema = z.enum(["open", "covered", "skipped"]);

export type GapState = z.infer<typeof gapStateSchema>;

// Generalized recall-gap mastery tracking (issue #57) — present only for a
// gap that has a gap_mastery sidecar row (probe-session quiz misses/corrects
// tracked it). Display-precedence rule (spec.md Decision 2 addendum): when
// this is non-null, the UI renders ITS status — never `gapState` — since
// `gapState` can independently be flipped by the untouched freeform Socratic
// flow while a mastery cycle is still below the mastery threshold.
export const gapMasteryStatusSchema = z.enum(["new", "practicing", "struggling", "mastered"]);

export type GapMasteryStatus = z.infer<typeof gapMasteryStatusSchema>;

export const gapMasteryViewSchema = z.object({
  status: gapMasteryStatusSchema,
  masteryStage: z.number().int(),
  correctCountInCycle: z.number().int(),
  incorrectCountInCycle: z.number().int(),
});

export type GapMasteryView = z.infer<typeof gapMasteryViewSchema>;

export const gapSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  label: z.string(),
  depth: depthLevelSchema,
  origin: gapOriginSchema,
  state: gapStateSchema,
  wanted: z.boolean(),
  concern: concernSchema.nullable(),
  lastEvaluatedAt: z.string().nullable(),
  mastery: gapMasteryViewSchema.nullable().optional(),
});

export type Gap = z.infer<typeof gapSchema>;

export const declareGapInput = z.object({
  topicId: z.string(),
  label: z.string().min(1),
  depth: depthLevelSchema.optional(),
  wanted: z.boolean().optional(),
  concern: concernSchema.optional(),
});

export type DeclareGapInput = z.infer<typeof declareGapInput>;

export const curateGapInput = z.object({
  gapId: z.string(),
  state: gapStateSchema.optional(),
  wanted: z.boolean().optional(),
  depth: depthLevelSchema.optional(),
  concern: concernSchema.nullable().optional(),
});

export type CurateGapInput = z.infer<typeof curateGapInput>;

export const gapVerdictSchema = z.object({
  gapId: z.string(),
  covered: z.boolean(),
});

export type GapVerdict = z.infer<typeof gapVerdictSchema>;

// Generalized recall-gap mastery tracking (issue #57, SCENARIO 7) — the
// cross-cutting nudge: a normalized gap label recurring across 3+ subjects,
// mastery-tracked gaps only, surfaced as a one-time appear-once note (never
// a persistent queue/count).
export const crossCuttingNudgeSchema = z.object({
  label: z.string(),
  subjectIds: z.array(z.string()),
  subjectNames: z.array(z.string()),
});

export type CrossCuttingNudge = z.infer<typeof crossCuttingNudgeSchema>;

export const crossCuttingNudgeResponseSchema = z.object({
  nudges: z.array(crossCuttingNudgeSchema),
});

export type CrossCuttingNudgeResponse = z.infer<typeof crossCuttingNudgeResponseSchema>;

export const probeEvaluationSchema = z.object({
  verdicts: z.array(gapVerdictSchema),
  newGaps: z.array(
    z.object({
      label: z.string(),
      depth: depthLevelSchema,
      concern: concernSchema.nullable(),
    }),
  ),
  nextPrompt: z.string().nullable(),
});

export type ProbeEvaluation = z.infer<typeof probeEvaluationSchema>;
