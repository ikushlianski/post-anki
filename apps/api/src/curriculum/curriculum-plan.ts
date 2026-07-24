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
  // Nullable (not plain-optional): matches the same OpenAI/Azure strict-mode
  // structured-output constraint documented on docResearchPlanSchema's
  // strictOrder — an optional key missing from `required` 400s the whole
  // response under strict mode.
  tags: z.array(z.string()).nullable(),
});

export const curriculumPlanSchema = z.object({
  modules: z.array(modulePlanSchema).min(1),
});

export type CurriculumPlan = z.infer<typeof curriculumPlanSchema>;

export const curriculumMergePlanSchema = z.object({
  modules: z.array(modulePlanSchema),
});
