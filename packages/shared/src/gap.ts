import { z } from "zod";
import { depthLevelSchema } from "./depth";
import { concernSchema } from "./concern";

export const gapOriginSchema = z.enum(["ai", "user"]);

export type GapOrigin = z.infer<typeof gapOriginSchema>;

export const gapStateSchema = z.enum(["open", "covered", "skipped"]);

export type GapState = z.infer<typeof gapStateSchema>;

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
