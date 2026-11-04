import { z } from "zod";
import { knowledgeBitFeedbackReasonSchema } from "./knowledge-bit-review-feedback.js";

const countSchema = z.number().int().min(0);

export const weeklyDigestCountsSchema = z.object({
  accepted: countSchema,
  rejected: countSchema,
  reviewed: countSchema,
});

export const weeklyDigestTopRejectReasonSchema = z.object({
  reason: knowledgeBitFeedbackReasonSchema,
  count: z.number().int().min(1),
  delta: z.number().int().optional(),
});

export const weeklyDigestCardSchema = z.object({
  current: weeklyDigestCountsSchema,
  previous: weeklyDigestCountsSchema,
  chatBacklog: countSchema,
  topRejectReasons: z.array(weeklyDigestTopRejectReasonSchema).optional(),
  chatCards: countSchema.optional(),
  chatTurns: countSchema.optional(),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export type WeeklyDigestCounts = z.infer<typeof weeklyDigestCountsSchema>;
export type WeeklyDigestTopRejectReason = z.infer<typeof weeklyDigestTopRejectReasonSchema>;
export type WeeklyDigestCard = z.infer<typeof weeklyDigestCardSchema>;
