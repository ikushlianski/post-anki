import { z } from "zod";
import { topicSchema } from "./topic";
import { moduleProgressSchema } from "./progress";
import { learningStatusSchema } from "./learning-status";

export const moduleSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  title: z.string(),
  order: z.number().int(),
  learningStatus: learningStatusSchema,
  topics: z.array(topicSchema),
  progress: moduleProgressSchema,
});

export type Module = z.infer<typeof moduleSchema>;

export const createModuleInput = z.object({
  curriculumId: z.string(),
  title: z.string().min(1),
});

export type CreateModuleInput = z.infer<typeof createModuleInput>;

export const reorderInput = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export type ReorderInput = z.infer<typeof reorderInput>;

export const updateModuleInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1).optional(),
  order: z.number().int().optional(),
  learningStatus: learningStatusSchema.optional(),
});

export type UpdateModuleInput = z.infer<typeof updateModuleInput>;
