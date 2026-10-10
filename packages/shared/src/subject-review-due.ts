import { z } from "zod";

export const subjectReviewDueCountSchema = z.object({
  subjectId: z.string().min(1),
  dueCount: z.number().int().min(0),
  newCount: z.number().int().min(0),
});

export type SubjectReviewDueCount = z.infer<typeof subjectReviewDueCountSchema>;

export const subjectReviewDueCountsSchema = z.object({
  subjects: z.array(subjectReviewDueCountSchema),
  unsorted: z.object({
    dueCount: z.number().int().min(0),
    newCount: z.number().int().min(0),
  }),
  newRemainingToday: z.number().int().min(0),
});

export type SubjectReviewDueCounts = z.infer<typeof subjectReviewDueCountsSchema>;
