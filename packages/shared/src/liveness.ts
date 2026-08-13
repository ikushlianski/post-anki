import { z } from "zod";

export const livenessScoreSchema = z.number().int().min(1).max(10);

export type LivenessScore = z.infer<typeof livenessScoreSchema>;

export const nudgeResponseSchema = z.enum(["yes", "no"]);

export type NudgeResponse = z.infer<typeof nudgeResponseSchema>;

export const livenessEntityTypeSchema = z.enum([
  "learning_list_item",
  "curriculum",
  "domain_node",
]);

export type LivenessEntityType = z.infer<typeof livenessEntityTypeSchema>;

export const livenessRecordSchema = z.object({
  id: z.string(),
  entityType: livenessEntityTypeSchema,
  entityId: z.string(),
  baseScore: livenessScoreSchema,
  lastActivityAt: z.string().nullable(),
  lastNudgeAt: z.string().nullable(),
  lastNudgeResponse: nudgeResponseSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LivenessRecord = z.infer<typeof livenessRecordSchema>;

export const livenessStatusSchema = z.object({
  entityType: livenessEntityTypeSchema,
  entityId: z.string(),
  score: livenessScoreSchema.nullable(),
  dormant: z.boolean(),
  generationAllowed: z.boolean(),
  nudgeDue: z.boolean(),
});

export type LivenessStatus = z.infer<typeof livenessStatusSchema>;

export const nudgeResponseInputSchema = z.object({
  entityType: livenessEntityTypeSchema,
  entityId: z.string(),
  response: nudgeResponseSchema,
});

export type NudgeResponseInput = z.infer<typeof nudgeResponseInputSchema>;
