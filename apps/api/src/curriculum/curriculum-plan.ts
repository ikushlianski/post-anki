import { z } from "zod";
import { depthLevelSchema } from "@post-anki/shared";

const topicPlanSchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  suggestedDepth: depthLevelSchema,
});

const modulePlanSchema = z.object({
  title: z.string(),
  topics: z.array(topicPlanSchema),
});

export const curriculumPlanSchema = z.object({
  modules: z.array(modulePlanSchema).min(1),
});

export type CurriculumPlan = z.infer<typeof curriculumPlanSchema>;

export const curriculumMergePlanSchema = z.object({
  modules: z.array(modulePlanSchema),
});
