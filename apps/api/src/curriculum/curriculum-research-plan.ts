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
  // Optional (not required/nullable) deliberately: this field was added after
  // some structured-output callers/fixtures already existed without it (see
  // docs/architecture/topic-ordering-importance.md's "failure modes" —
  // omission must default safely to false, not reject the whole plan).
  strictOrder: z.boolean().optional(),
});

export type DocResearchPlan = z.infer<typeof docResearchPlanSchema>;
