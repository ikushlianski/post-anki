import { z } from "zod";
import { maxReviewsPerDaySchema, newCardsPerDaySchema } from "./admin-settings";

const countSchema = z.number().int().min(0);

export const subjectReviewDueLimitsSchema = z.object({
  newCardsPerDay: newCardsPerDaySchema,
  maxReviewsPerDay: maxReviewsPerDaySchema,
});

export type SubjectReviewDueLimits = z.infer<typeof subjectReviewDueLimitsSchema>;

const todayCountFields = {
  reviewTodayCount: countSchema.default(0),
  learningDueCount: countSchema.default(0),
  todayCount: countSchema.default(0),
};

export const subjectReviewDueCountSchema = z.object({
  subjectId: z.string().min(1),
  dueCount: z.number().int().min(0),
  newCount: z.number().int().min(0),
  ...todayCountFields,
  limits: subjectReviewDueLimitsSchema.nullable().default(null),
});

export type SubjectReviewDueCount = z.input<typeof subjectReviewDueCountSchema>;

export type ParsedSubjectReviewDueCount = z.output<typeof subjectReviewDueCountSchema>;

export const subjectReviewDueCountsSchema = z.object({
  subjects: z.array(subjectReviewDueCountSchema),
  unsorted: z.object({
    dueCount: z.number().int().min(0),
    newCount: z.number().int().min(0),
    ...todayCountFields,
  }),
  newRemainingToday: z.number().int().min(0),
  reviewsRemainingToday: countSchema.nullable().default(null),
});

export type SubjectReviewDueCounts = z.input<typeof subjectReviewDueCountsSchema>;

export type ParsedSubjectReviewDueCounts = z.output<typeof subjectReviewDueCountsSchema>;
