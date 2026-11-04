import { z } from "zod";

export const CHAT_QUEUE_OUTCOMES_WINDOW_DAYS = 30;

export const chatQueueOutcomesStatisticsSchema = z.object({
  windowDays: z.number().int().min(1),
  total: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  waiting: z.number().int().min(0),
  snoozed: z.number().int().min(0),
});

export type ChatQueueOutcomesStatistics = z.infer<typeof chatQueueOutcomesStatisticsSchema>;
