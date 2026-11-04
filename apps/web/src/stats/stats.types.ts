import { z } from 'zod'

const envSchema = z.string()

export const learningStatsSchema = z.object({
  today: z.object({ reviews: z.number(), newCards: z.number() }),
  daily: z.array(
    z.object({
      date: z.string(),
      reviews: z.number(),
      newCards: z.number(),
      passed: z.number(),
      studyMs: z.number(),
    }),
  ),
  hourly: z.array(z.object({ hour: z.number(), reviews: z.number() })),
  streak: z.object({ current: z.number(), longest: z.number() }),
  accuracy: z.object({ overall: z.number().nullable(), last7: z.number().nullable() }),
  env: envSchema,
})

export const aiSpendSchema = z.object({
  currency: z.literal('USD'),
  estimated: z.boolean(),
  days: z.array(
    z.object({
      date: z.string(),
      cardsUsd: z.number(),
      chatUsd: z.number(),
      otherUsd: z.number(),
    }),
  ),
  totals: z.object({ cardsUsd: z.number(), chatUsd: z.number(), otherUsd: z.number() }),
  byModel: z.array(z.object({ modelId: z.string(), usd: z.number() })),
  triageByModel: z.array(z.object({ modelId: z.string(), kept: z.number(), rejected: z.number() })),
  unpriced: z.object({ calls: z.number(), tokens: z.number() }),
  env: envSchema,
})

export const statsQuerySchema = z.object({
  tz: z.string().min(1),
  days: z.number().int().positive(),
})

export type LearningStats = z.infer<typeof learningStatsSchema>
export type AiSpend = z.infer<typeof aiSpendSchema>
export type StatsQuery = z.infer<typeof statsQuerySchema>

export const RANGE_OPTIONS = [30, 90, 365] as const
