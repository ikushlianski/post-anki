import { z } from "zod";
import { modelTierSchema } from "./model-tier";

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
  modelTier: modelTierSchema.nullable(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean().optional(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;

export const updateSubjectInput = z.object({
  modelTier: modelTierSchema.nullable().optional(),
});

export type UpdateSubjectInput = z.infer<typeof updateSubjectInput>;

export const mergeSubjectsInput = z.object({
  sourceSubjectId: z.string(),
});

export type MergeSubjectsInput = z.infer<typeof mergeSubjectsInput>;

export const mergeSubjectsResultSchema = z.object({
  targetSubjectId: z.string(),
  sourceSubjectId: z.string(),
  curriculaMoved: z.number(),
  domainNodesMoved: z.number(),
});

export type MergeSubjectsResult = z.infer<typeof mergeSubjectsResultSchema>;
