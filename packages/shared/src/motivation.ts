import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const DEFAULT_STREAK_MIN_REVIEWS = 5;
export const DEFAULT_REST_DAYS_PER_MONTH = 2;
export const MAX_PAUSE_DAYS = 30;

export const motivationSettingsSchema = z.object({
  timeZone: validTimeZoneSchema,
  timeZoneConfigured: z.boolean(),
  streakMinReviews: z.number().int().min(1).max(500),
  restDaysPerMonth: z.number().int().min(0).max(10),
});

export type MotivationSettings = z.infer<typeof motivationSettingsSchema>;

export const updateMotivationSettingsInput = z
  .object({
    timeZone: validTimeZoneSchema.optional(),
    streakMinReviews: z.number().int().min(1).max(500).optional(),
    restDaysPerMonth: z.number().int().min(0).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "nothing to update");

export type UpdateMotivationSettingsInput = z.infer<typeof updateMotivationSettingsInput>;

export const streakStatusSchema = z.enum(["none", "done_today", "active", "resting", "paused", "broken"]);

export type StreakStatus = z.infer<typeof streakStatusSchema>;

export const goalStreakSchema = z.object({
  status: streakStatusSchema,
  current: z.number().int().min(0),
  longest: z.number().int().min(0),
  restDaysLeft: z.number().int().min(0),
  pausedUntil: z.string().nullable(),
  comeback: z.boolean(),
  previousStreak: z.number().int().min(0),
  activeDaysLast30: z.number().int().min(0),
});

export type GoalStreak = z.infer<typeof goalStreakSchema>;

export const pauseStreakInput = z.object({
  days: z.number().int().min(0).max(MAX_PAUSE_DAYS),
});

export type PauseStreakInput = z.infer<typeof pauseStreakInput>;

export const motivationProgressQuery = z.object({
  tz: validTimeZoneSchema.default("UTC"),
  days: z.coerce.number().int().min(7).max(366).default(120),
});

export const todayViewSchema = z.object({
  date: z.string(),
  reviewsDone: z.number().int().min(0),
  threshold: z.number().int().min(1),
  thresholdIsGoal: z.boolean(),
  dayQualified: z.boolean(),
  streak: goalStreakSchema,
});

export type TodayView = z.infer<typeof todayViewSchema>;

export const recallSurpriseSchema = z.object({
  knowledgeBitId: z.string(),
  gapDays: z.number().int().min(1),
  subjectName: z.string().nullable(),
});

export type RecallSurprise = z.infer<typeof recallSurpriseSchema>;

export const sessionSummarySchema = z.object({
  doneToday: z.number().int().min(0),
  goalTarget: z.number().int().nullable(),
  goalMet: z.boolean(),
  bonus: z.number().int().min(0),
  newlySolid: z.number().int().min(0),
  tomorrowDue: z.number().int().min(0),
  tomorrowMinutes: z.number().int().min(0),
  streak: goalStreakSchema,
  surprise: recallSurpriseSchema.nullable(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const heatmapDaySchema = z.object({
  date: z.string(),
  reviews: z.number().int().min(0),
});

export const weeklySolidSchema = z.object({
  weekStart: z.string(),
  solid: z.number().int().min(0),
});

export const subjectMasterySchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  totalCards: z.number().int().min(0),
  masteredCards: z.number().int().min(0),
  percent: z.number().int().min(0).max(100),
  solidThisWeek: z.number().int().min(0),
  solidThisMonth: z.number().int().min(0),
  reviewsThisWeek: z.number().int().min(0),
  reviewsLastWeek: z.number().int().min(0),
});

export type SubjectMastery = z.infer<typeof subjectMasterySchema>;

export const progressViewSchema = z.object({
  heatmap: z.array(heatmapDaySchema),
  dailyAverage: z.number().min(0),
  solidByWeek: z.array(weeklySolidSchema),
  solidThisWeek: z.number().int().min(0),
  retentionOlderCards: z.number().int().min(0).max(100).nullable(),
  retentionSample: z.number().int().min(0),
  subjects: z.array(subjectMasterySchema),
});

export type ProgressView = z.infer<typeof progressViewSchema>;

export const weeklySummarySchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  goalDays: z.number().int().min(0),
  activeDays: z.number().int().min(0),
  reviews: z.number().int().min(0),
  reviewsLastWeek: z.number().int().min(0),
  newlySolid: z.number().int().min(0),
  focusMet: z.number().int().min(0),
  focusTotal: z.number().int().min(0),
  nextWeekKey: z.string(),
  needsNextWeekPriorities: z.boolean(),
});

export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
