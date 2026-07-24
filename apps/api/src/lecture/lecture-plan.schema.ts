import { z } from "zod";

export const lecturePlanSchema = z.object({
  title: z.string(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
      }),
    )
    .min(1)
    .max(6),
  citations: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
      }),
    )
    .min(1),
});

export type LecturePlan = z.infer<typeof lecturePlanSchema>;
