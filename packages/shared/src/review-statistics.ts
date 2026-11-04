import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const REVIEW_STATISTICS_FORECAST_DAYS = [7, 14, 30] as const;

export const REVIEW_STATISTICS_HISTORY_DAYS = [30, 90, 365, 0] as const;

const gradeCountSchema = z.number().int().min(0);

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reviewStatisticsQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
  subjectId: z.string().min(1).optional(),
  forecastDays: z.coerce
    .number()
    .int()
    .refine((value) => (REVIEW_STATISTICS_FORECAST_DAYS as readonly number[]).includes(value), "unsupported horizon")
    .default(14),
  historyDays: z.coerce
    .number()
    .int()
    .refine((value) => (REVIEW_STATISTICS_HISTORY_DAYS as readonly number[]).includes(value), "unsupported window")
    .default(90),
});

export type ReviewStatisticsQuery = z.infer<typeof reviewStatisticsQuerySchema>;

export const reviewStatisticsResponseSchema = z.object({
  forecast: z.object({
    overdue: z.number().int().min(0),
    days: z.array(z.object({ date: localDateSchema, count: z.number().int().min(0) })),
  }),
  retention: z.object({
    granularity: z.enum(["day", "week"]),
    overallRate: z.number().min(0).max(1).nullable(),
    points: z.array(
      z.object({
        date: localDateSchema,
        total: z.number().int().min(0),
        passed: z.number().int().min(0),
        rate: z.number().min(0).max(1).nullable(),
      }),
    ),
  }),
  answerButtons: z.object({
    total: z.number().int().min(0),
    counts: z.object({
      again: gradeCountSchema,
      hard: gradeCountSchema,
      good: gradeCountSchema,
      easy: gradeCountSchema,
    }),
  }),
  range: z.object({ earliestReviewDate: localDateSchema.nullable() }),
});

export type ReviewStatistics = z.infer<typeof reviewStatisticsResponseSchema>;
