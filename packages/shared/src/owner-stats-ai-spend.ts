import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const ownerStatsAiSpendQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
  days: z.coerce.number().int().min(1).max(366).default(90),
});

export type OwnerStatsAiSpendQuery = z.infer<typeof ownerStatsAiSpendQuerySchema>;

const usd = z.number().nonnegative();

export const ownerStatsAiSpendSchema = z.object({
  currency: z.literal("USD"),
  estimated: z.literal(true),
  days: z.array(
    z.object({
      date: z.string(),
      cardsUsd: usd,
      chatUsd: usd,
      otherUsd: usd,
    }),
  ),
  totals: z.object({
    cardsUsd: usd,
    chatUsd: usd,
    otherUsd: usd,
  }),
  byModel: z.array(z.object({ modelId: z.string(), usd })),
  triageByModel: z.array(
    z.object({
      modelId: z.string(),
      kept: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    }),
  ),
  unpriced: z.object({
    calls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
  }),
  env: z.string(),
});

export type OwnerStatsAiSpend = z.infer<typeof ownerStatsAiSpendSchema>;
