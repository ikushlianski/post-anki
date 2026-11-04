import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const EXAM_NEW_MATERIAL_SHARE = 0.75;
export const PAUSE_REVIEWS_PER_NEW_CARD = 20;
export const PAUSE_MIN_REVIEWS = 100;
export const RETENTION_MULTIPLIER_MIN = 0.5;
export const RETENTION_MULTIPLIER_MAX = 2;
export const LONG_TERM_MAX_INTERVAL_DAYS = 365;
export const EXAM_DATE_MAX_DAYS_AHEAD = 730;
export const EXAM_MAX_NEW_CARDS_PER_DAY = 200;

export const studyIntentSchema = z.enum(["exam", "long_term"]);

export type StudyIntent = z.infer<typeof studyIntentSchema>;

export const examDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const moment = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(moment.getTime()) && moment.toISOString().slice(0, 10) === value;
  }, "not a real calendar date");

export const EXAM_DATE_ERROR_CODES = [
  "exam_date_required",
  "exam_date_in_past",
  "exam_date_too_far",
  "exam_date_requires_exam_intent",
] as const;

export type ExamDateErrorCode = (typeof EXAM_DATE_ERROR_CODES)[number];

export const studyForecastQuerySchema = z.object({
  tz: validTimeZoneSchema.optional(),
});

export type StudyForecastQuery = z.infer<typeof studyForecastQuerySchema>;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const studyForecastSchema = z.object({
  intent: studyIntentSchema,
  examDate: localDateSchema.nullable(),
  daysLeft: z.number().int().nullable(),
  examPassed: z.boolean(),
  desiredRetention: z.number(),
  recentRetention: z.number().min(0).max(1).nullable(),
  maxIntervalDays: z.number().int().min(1),
  hasCards: z.boolean(),
  newCards: z.object({
    perDay: z.number().int().min(0),
    paced: z.boolean(),
    pausedToday: z.boolean(),
    pauseThreshold: z.number().int().min(0),
    remaining: z.number().int().min(0),
    finishOn: localDateSchema.nullable(),
    finishesBeforeExam: z.boolean().nullable(),
  }),
  reviews: z.object({
    dueToday: z.number().int().min(0),
    averagePerDay: z.number().min(0),
    peakPerDay: z.number().int().min(0),
    peakOn: localDateSchema.nullable(),
    horizonDays: z.number().int().min(0),
  }),
  days: z.array(
    z.object({
      date: localDateSchema,
      reviews: z.number().int().min(0),
      newCards: z.number().int().min(0),
    }),
  ),
});

export type StudyForecast = z.infer<typeof studyForecastSchema>;
