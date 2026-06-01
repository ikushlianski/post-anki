import { z } from "zod";
import { sourceSchema, sourceDraftSchema } from "./source";
import { moduleSchema } from "./module";
import { curriculumProgressSchema } from "./progress";
import { learningStatusSchema } from "./learning-status";

export const curriculumStatusSchema = z.enum([
  "draft",
  "curating",
  "ready",
  "confirmed",
  "failed",
]);

export type CurriculumStatus = z.infer<typeof curriculumStatusSchema>;

export const curriculumSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: curriculumStatusSchema,
  learningStatus: learningStatusSchema,
});

export type Curriculum = z.infer<typeof curriculumSchema>;

export const createCurriculumInput = z.object({
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  sources: z.array(sourceDraftSchema).default([]),
});

export type CreateCurriculumInput = z.infer<typeof createCurriculumInput>;

export const addSourcesInput = z.object({
  curriculumId: z.string(),
  sources: z.array(sourceDraftSchema).min(1),
});

export type AddSourcesInput = z.infer<typeof addSourcesInput>;

export const updateCurriculumInput = z.object({
  curriculumId: z.string(),
  learningStatus: learningStatusSchema,
});

export type UpdateCurriculumInput = z.infer<typeof updateCurriculumInput>;

export const curriculumDetailSchema = z.object({
  curriculum: curriculumSchema,
  sources: z.array(sourceSchema),
  modules: z.array(moduleSchema),
  progress: curriculumProgressSchema,
  recommendedTopicId: z.string().nullable(),
});

export type CurriculumDetail = z.infer<typeof curriculumDetailSchema>;
