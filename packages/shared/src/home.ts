import { z } from "zod";

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
