import { z } from "zod";
import { questionSchema } from "./question";
import { topicProgressSchema } from "./progress";
import { depthLevelSchema } from "./depth";
import { learningStatusSchema } from "./learning-status";
import { gapSchema } from "./gap";

export const selfGradeSchema = z.number().int().min(1).max(5);

export type SelfGrade = z.infer<typeof selfGradeSchema>;

export const topicSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  order: z.number().int(),
  included: z.boolean(),
  selfGrade: selfGradeSchema.nullable(),
  depth: depthLevelSchema,
  learningStatus: learningStatusSchema,
  questions: z.array(questionSchema),
  gaps: z.array(gapSchema).optional(),
  progress: topicProgressSchema,
});

export type Topic = z.infer<typeof topicSchema>;

export const createTopicInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  suggestedDepth: depthLevelSchema.optional(),
});

export type CreateTopicInput = z.infer<typeof createTopicInput>;

export const updateTopicInput = z.object({
  topicId: z.string(),
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  moduleId: z.string().optional(),
  order: z.number().int().optional(),
  included: z.boolean().optional(),
  selfGrade: selfGradeSchema.nullable().optional(),
  depth: depthLevelSchema.optional(),
  learningStatus: learningStatusSchema.optional(),
});

export type UpdateTopicInput = z.infer<typeof updateTopicInput>;
