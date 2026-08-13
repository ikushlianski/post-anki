import { z } from "zod";
import { moduleProgressSchema } from "./progress";

export const learningPathStatusSchema = z.enum(["draft", "active", "completed", "abandoned"]);

export type LearningPathStatus = z.infer<typeof learningPathStatusSchema>;

export const learningPathSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  targetRoleLabel: z.string().min(1),
  status: learningPathStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type LearningPath = z.infer<typeof learningPathSchema>;

export const learningPathStepSchema = z.object({
  id: z.string(),
  pathId: z.string(),
  domainNodeId: z.string(),
  order: z.number().int(),
  createdAt: z.string(),
});

export type LearningPathStep = z.infer<typeof learningPathStepSchema>;

export const pathStepStatusSchema = z.enum(["not_started", "in_progress", "done"]);

export type PathStepStatus = z.infer<typeof pathStepStatusSchema>;

export const pathStepProgressSchema = z.object({
  domainNodeId: z.string(),
  progress: moduleProgressSchema,
  status: pathStepStatusSchema,
});

export type PathStepProgress = z.infer<typeof pathStepProgressSchema>;

export const pathProgressSchema = z.object({
  overallStatus: pathStepStatusSchema,
  steps: z.array(pathStepProgressSchema),
});

export type PathProgress = z.infer<typeof pathProgressSchema>;

export const learningPathDetailSchema = z.object({
  path: learningPathSchema,
  steps: z.array(learningPathStepSchema),
  progress: pathProgressSchema,
  nextStepDomainNodeId: z.string().nullable(),
});

export type LearningPathDetail = z.infer<typeof learningPathDetailSchema>;

export const roleTemplateTargetSchema = z.object({
  domainNodeId: z.string(),
  name: z.string(),
});

export type RoleTemplateTarget = z.infer<typeof roleTemplateTargetSchema>;

export const roleTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetRoleLabel: z.string(),
  targets: z.array(roleTemplateTargetSchema),
});

export type RoleTemplate = z.infer<typeof roleTemplateSchema>;

export const listRoleTemplatesResponseSchema = z.array(roleTemplateSchema);

export type ListRoleTemplatesResponse = z.infer<typeof listRoleTemplatesResponseSchema>;

export const createLearningPathInput = z.object({
  roleTemplateId: z.string().min(1),
});

export type CreateLearningPathInput = z.infer<typeof createLearningPathInput>;

export const updateLearningPathInput = z.object({
  status: z.literal("abandoned"),
});

export type UpdateLearningPathInput = z.infer<typeof updateLearningPathInput>;

export const listLearningPathsResponseSchema = z.array(learningPathSchema);

export type ListLearningPathsResponse = z.infer<typeof listLearningPathsResponseSchema>;
