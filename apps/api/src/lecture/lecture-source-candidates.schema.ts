import { z } from "zod";

export const lectureSourceCandidatesPlanSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        whySelected: z.string(),
      }),
    )
    .max(6),
});

export type LectureSourceCandidatesPlan = z.infer<typeof lectureSourceCandidatesPlanSchema>;
