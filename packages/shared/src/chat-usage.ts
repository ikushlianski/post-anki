import { z } from "zod";

export const chatUsageSchema = z.object({
  day: z.string(),
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  hourlyCap: z.number().int().positive(),
  currentHourCount: z.number().int().nonnegative(),
  budgetStatus: z.enum(["ok", "paused"]),
});

export type ChatUsage = z.infer<typeof chatUsageSchema>;
