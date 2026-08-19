import { z } from "zod";
import { depthLevelSchema } from "@post-anki/shared";

const topicPlanSchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  suggestedDepth: depthLevelSchema,
  // S2 provenance — the SOURCE_URL marker (source-text.ts) of the crawled
  // page this topic was grounded in, when the material came from a single
  // identifiable page. Null when the topic draws on pasted text, several
  // pages at once, or the model's own trained knowledge. Nullable (not
  // plain-optional) — matches every other optional-under-strict-mode field
  // in this schema (see `tags` above).
  sourceUrl: z.string().nullable(),
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
