import { z } from "zod";
import { learningStatusSchema } from "./learning-status";
import { levelSchema } from "./level";
import { moduleProgressSchema, topicProgressSchema } from "./progress";

export const learningMapTopicSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  progress: topicProgressSchema,
});

export type LearningMapTopicSnapshot = z.infer<typeof learningMapTopicSnapshotSchema>;

export const learningMapModuleSnapshotSchema = z.object({
  level: levelSchema.nullable(),
  progress: moduleProgressSchema,
  topics: z.array(learningMapTopicSnapshotSchema),
});

export type LearningMapModuleSnapshot = z.infer<typeof learningMapModuleSnapshotSchema>;

export const learningMapSnapshotSchema = z.object({
  curriculumId: z.string(),
  curriculumName: z.string(),
  subjectName: z.string(),
  learningStatus: learningStatusSchema,
  percent: z.number().int(),
  lastInteractedAt: z.string().nullable(),
  modules: z.array(learningMapModuleSnapshotSchema),
});

export type LearningMapSnapshot = z.infer<typeof learningMapSnapshotSchema>;
