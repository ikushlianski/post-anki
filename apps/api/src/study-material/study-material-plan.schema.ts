import { z } from "zod";

export const studyMaterialPlanSchema = z.object({
  body: z.string(),
  citations: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type StudyMaterialPlan = z.infer<typeof studyMaterialPlanSchema>;
