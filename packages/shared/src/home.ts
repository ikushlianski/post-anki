import { z } from "zod";
import { reviewCountsSchema } from "./knowledge-bit-review";
import { validTimeZoneSchema } from "./time-zone";

export const topSubjectSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  lastInteractedAt: z.string(),
  topicsTouchedLast30Days: z.number().int(),
});

export type TopSubject = z.infer<typeof topSubjectSchema>;

export const homeFunStatsSchema = z.object({
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  topicsMastered: z.number().int(),
  questionsAnswered: z.number().int(),
});

export type HomeFunStats = z.infer<typeof homeFunStatsSchema>;

export const homeSummarySchema = z.object({
  topSubjects: z.array(topSubjectSchema),
  funStats: homeFunStatsSchema,
});

export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const STUDY_OVERVIEW_DEFAULT_DAYS = 28;
export const STUDY_OVERVIEW_MAX_DAYS = 120;

export const studyOverviewQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
  days: z.coerce.number().int().min(1).max(STUDY_OVERVIEW_MAX_DAYS).default(STUDY_OVERVIEW_DEFAULT_DAYS),
});

export type StudyOverviewQuery = z.infer<typeof studyOverviewQuerySchema>;

export const studyOverviewActivityDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(0),
});

export type StudyOverviewActivityDay = z.infer<typeof studyOverviewActivityDaySchema>;

export const studyOverviewSchema = z.object({
  counts: reviewCountsSchema,
  reviewedToday: z.number().int().min(0),
  activity: z.array(studyOverviewActivityDaySchema),
  nextDueAt: z.string().nullable(),
  hasCards: z.boolean(),
});

export type StudyOverview = z.infer<typeof studyOverviewSchema>;
