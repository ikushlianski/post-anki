import { z } from "zod";
import { depthLevelSchema } from "./depth";
import { concernSchema } from "./concern";

export const gapOriginSchema = z.enum(["ai", "user"]);

export type GapOrigin = z.infer<typeof gapOriginSchema>;

export const gapStateSchema = z.enum(["open", "covered", "skipped"]);

export type GapState = z.infer<typeof gapStateSchema>;

// Gap triage (issue #29) — orthogonal to `state` above, never overloading it
// (matching the same "don't overload state" lesson gap_mastery already
// documents). Literal value `user_deferred`, not `deferred`, reserved room
// for the `auto_deferred` sibling (issue #33) added below without another
// migration touching this column's existing rows.
export const gapTriageStateSchema = z.enum([
  "untriaged",
  "important",
  "user_deferred",
  "auto_deferred",
  "dismissed",
]);

export type GapTriageState = z.infer<typeof gapTriageStateSchema>;

// `revisit` is the dismissed-check-in's "Actually, let's revisit" outcome
// (issue #29 SCENARIO 6) — reopens a dismissed gap back to `untriaged`. It
// reuses this same locked transition path rather than a bespoke endpoint so
// there is exactly one write path for every triage-state change.
export const triageActionSchema = z.enum(["important", "defer", "dismiss", "revisit"]);

export type TriageAction = z.infer<typeof triageActionSchema>;

export const triageGapInput = z.object({
  action: triageActionSchema,
});

export type TriageGapInput = z.infer<typeof triageGapInput>;

export const resurfaceKindSchema = z.enum(["deferral-expired", "dismissed-checkin"]);

export type ResurfaceKind = z.infer<typeof resurfaceKindSchema>;

export const markGapResurfacedInput = z.object({
  kind: resurfaceKindSchema,
});

export type MarkGapResurfacedInput = z.infer<typeof markGapResurfacedInput>;

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
  triageState: gapTriageStateSchema,
  triagedAt: z.string().nullable(),
  deferredUntil: z.string().nullable(),
  deferralCount: z.number().int(),
  dismissedAt: z.string().nullable(),
  dismissedCheckinSentAt: z.string().nullable(),
  // Auto-defer timer (issue #33). Non-nullable to match the column — carries
  // a stale-but-harmless value for a gap in any non-`untriaged` state,
  // because no predicate reads it outside the `untriaged` branch.
  untriagedSince: z.string(),
  autoDeferredAt: z.string().nullable(),
});

export type Gap = z.infer<typeof gapSchema>;

// The tool (subject) name travels alongside the gap on both the
// triage-write response and the resurface-candidate read — the bot's tap
// confirmation ("Noted — {Tool}: ...") needs the exact same name the
// original resurfacing/check-in message already showed, without a second
// round trip or brittle re-parsing of the earlier message text.
export const triageGapResultSchema = z.object({
  gap: gapSchema,
  changed: z.boolean(),
  tool: z.string(),
});

export type TriageGapResultDto = z.infer<typeof triageGapResultSchema>;

export const gapDueForResurfaceItemSchema = z.object({
  gap: gapSchema,
  tool: z.string(),
});

export type GapDueForResurfaceItem = z.infer<typeof gapDueForResurfaceItemSchema>;

export const gapsDueForResurfaceResponseSchema = z.object({
  userDeferredDue: z.array(gapDueForResurfaceItemSchema),
  dismissedCheckinDue: z.array(gapDueForResurfaceItemSchema),
});

export type GapsDueForResurfaceResponse = z.infer<typeof gapsDueForResurfaceResponseSchema>;

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
