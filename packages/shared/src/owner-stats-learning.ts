import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const countSchema = z.number().int().min(0);

export const ownerStatsLearningQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
  days: z.coerce.number().int().min(1).max(366).default(90),
});

export type OwnerStatsLearningQuery = z.infer<typeof ownerStatsLearningQuerySchema>;

export const ownerStatsLearningSchema = z.object({
  env: z.string(),
  today: z.object({ reviews: countSchema, newCards: countSchema }),
  daily: z.array(
    z.object({
      date: localDateSchema,
      reviews: countSchema,
      newCards: countSchema,
      passed: countSchema,
      studyMs: countSchema,
    }),
  ),
  hourly: z.array(z.object({ hour: z.number().int().min(0).max(23), reviews: countSchema })).length(24),
  streak: z.object({ current: countSchema, longest: countSchema }),
  accuracy: z.object({
    overall: z.number().min(0).max(1).nullable(),
    last7: z.number().min(0).max(1).nullable(),
  }),
});

export type OwnerStatsLearning = z.infer<typeof ownerStatsLearningSchema>;
