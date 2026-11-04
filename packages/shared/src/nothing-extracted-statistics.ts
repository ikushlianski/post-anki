import { z } from "zod";

export const nothingExtractedWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  processed: z.number().int().min(0),
  nothingExtracted: z.number().int().min(0),
  rate: z.number().min(0).max(1),
});

export const nothingExtractedStatisticsSchema = z.object({
  weekly: z.array(nothingExtractedWeekSchema),
});

export type NothingExtractedWeek = z.infer<typeof nothingExtractedWeekSchema>;
export type NothingExtractedStatistics = z.infer<typeof nothingExtractedStatisticsSchema>;
