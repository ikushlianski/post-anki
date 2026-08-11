import { z } from "zod";
import { depthLevelSchema } from "@post-anki/shared";

// Deliberately narrower than `curriculumPlanSchema` (curriculum-plan.ts):
// no `tags` field. `saveCurriculumPlan` resolves proposed tags via
// `resolveOrCreateTag`, which is model output creating a taxonomy-adjacent
// row — exactly what this path must never do (see slice-generation.ts's
// module comment). Omitting the field here leaves nothing for a write path
// to leak.
const sliceGapPlanSchema = z.object({
  label: z.string(),
  depth: depthLevelSchema,
});

const sliceTopicPlanSchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  gaps: z.array(sliceGapPlanSchema),
});

export const sliceGenerationPlanSchema = z.object({
  topics: z.array(sliceTopicPlanSchema),
});

export type SliceGenerationPlan = z.infer<typeof sliceGenerationPlanSchema>;
