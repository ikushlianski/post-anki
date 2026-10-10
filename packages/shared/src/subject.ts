import { z } from "zod";
import { modelTierSchema } from "./model-tier";

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
  modelTier: modelTierSchema.nullable(),
  parentId: z.string().nullable(),
  sortOrder: z.number().nullable().optional(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean().optional(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
  parentId: z.string().nullable().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;

export const updateSubjectInput = z.object({
  name: z.string().trim().min(1).optional(),
  modelTier: modelTierSchema.nullable().optional(),
  parentId: z.string().nullable().optional(),
});

export type UpdateSubjectInput = z.infer<typeof updateSubjectInput>;

export const subjectSearchQueryInput = z.string().trim().min(1).max(100);

export type SubjectSearchResponse = Subject[];

export const reorderSubjectsInput = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()),
});

export type ReorderSubjectsInput = z.infer<typeof reorderSubjectsInput>;

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
