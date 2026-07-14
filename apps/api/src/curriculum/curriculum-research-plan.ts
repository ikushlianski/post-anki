import { z } from "zod";
import { depthLevelSchema, levelSchema } from "@post-anki/shared";

const docResearchTopicSchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  suggestedDepth: depthLevelSchema,
});

const docResearchModuleSchema = z.object({
  title: z.string(),
  level: levelSchema,
  topics: z.array(docResearchTopicSchema),
});

export const docResearchPlanSchema = z.object({
  modules: z.array(docResearchModuleSchema).min(1),
});

export type DocResearchPlan = z.infer<typeof docResearchPlanSchema>;
