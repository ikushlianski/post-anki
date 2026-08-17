import { z } from "zod";
import { concernSummarySchema } from "./concern";
import { streakSchema } from "./streak";

export const timeToMasterySummarySchema = z.object({
  count: z.number().int(),
  avgHours: z.number(),
  medianHours: z.number(),
});

export type TimeToMasterySummary = z.infer<typeof timeToMasterySummarySchema>;

export const retentionSummarySchema = z.object({
  count: z.number().int(),
  avgRate: z.number(),
  medianRate: z.number(),
});

export type RetentionSummary = z.infer<typeof retentionSummarySchema>;

export const domainMasteryStatusSchema = z.enum(["gap", "progress"]);

export const coverageAreaSchema = z.object({
  domainNodeId: z.string(),
  name: z.string(),
  subjectName: z.string(),
  percent: z.number().int(),
  status: domainMasteryStatusSchema,
});

export type CoverageArea = z.infer<typeof coverageAreaSchema>;

export const coverageReportSchema = z.array(coverageAreaSchema);

export type CoverageReport = z.infer<typeof coverageReportSchema>;

export const masteryBreakdownEntrySchema = z.object({
  key: z.string(),
  timeToMastery: timeToMasterySummarySchema.nullable(),
  retention: retentionSummarySchema.nullable(),
});

export type MasteryBreakdownEntry = z.infer<typeof masteryBreakdownEntrySchema>;

export const retentionReportSchema = z.object({
  overall: retentionSummarySchema.nullable(),
  timeToMasteryOverall: timeToMasterySummarySchema.nullable(),
  byTopic: z.array(masteryBreakdownEntrySchema),
  byArea: z.array(masteryBreakdownEntrySchema),
});

export type RetentionReport = z.infer<typeof retentionReportSchema>;

export const weeklyDigestSchema = z.object({
  windowDays: z.number().int(),
  timeToMastery: timeToMasterySummarySchema.nullable(),
  retention: retentionSummarySchema.nullable(),
  coverage: coverageReportSchema,
  concerns: z.array(concernSummarySchema),
  streak: streakSchema,
});

export type WeeklyDigest = z.infer<typeof weeklyDigestSchema>;
