import { z } from "zod";

export const concernSchema = z.enum([
  "security",
  "performance",
  "observability",
  "cost",
  "reliability",
  "developer_experience",
]);

export type Concern = z.infer<typeof concernSchema>;

export const CONCERNS: Concern[] = [
  "security",
  "performance",
  "observability",
  "cost",
  "reliability",
  "developer_experience",
];

export const concernSummarySchema = z.object({
  concern: concernSchema,
  open: z.number().int(),
  covered: z.number().int(),
  total: z.number().int(),
});

export type ConcernSummary = z.infer<typeof concernSummarySchema>;

export const crossCuttingResponseSchema = z.object({
  summaries: z.array(concernSummarySchema),
});

export type CrossCuttingResponse = z.infer<typeof crossCuttingResponseSchema>;
