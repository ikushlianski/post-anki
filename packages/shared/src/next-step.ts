import { z } from "zod";
import { levelSchema } from "./level";

export const nextStepRecommendationSchema = z
  .object({
    kind: z.literal("next_level"),
    curriculumId: z.string(),
    level: levelSchema,
    topicId: z.string(),
  })
  .or(
    z.object({
      kind: z.literal("different_topic"),
      topicId: z.string(),
    }),
  )
  .nullable();

export type NextStepRecommendation = z.infer<typeof nextStepRecommendationSchema>;
