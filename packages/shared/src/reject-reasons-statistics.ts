import { z } from "zod";
import { knowledgeBitFeedbackReasonSchema } from "./knowledge-bit-review-feedback";
import { rejectSubjectTypeSchema } from "./reject-reasons-by-subject-type";

export const rejectReasonWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rejected: z.number().int().min(0),
  decided: z.number().int().min(0),
  rejectRate: z.number().min(0).max(1),
  topReasons: z.array(
    z.object({
      reasonCode: knowledgeBitFeedbackReasonSchema,
      count: z.number().int().min(0),
    }),
  ),
});

export const rejectReasonSubjectSchema = z.object({
  subjectName: z.string(),
  rejected: z.number().int().min(0),
  decided: z.number().int().min(0),
  rejectRate: z.number().min(0).max(1),
});

export const rejectReasonShareSchema = z.object({
  reasonCode: knowledgeBitFeedbackReasonSchema,
  count: z.number().int().min(0),
  share: z.number().min(0).max(1),
});

export const rejectReasonTypeBreakdownSchema = z.object({
  subjectType: rejectSubjectTypeSchema,
  total: z.number().int().min(0),
  reasons: z.array(rejectReasonShareSchema),
});

export const rejectReasonsStatisticsSchema = z.object({
  total: z.number().int().min(0),
  reasons: z.array(rejectReasonShareSchema),
  bySubjectType: z.array(rejectReasonTypeBreakdownSchema).optional(),
  weekly: z.array(rejectReasonWeekSchema).optional(),
  bySubject: z.array(rejectReasonSubjectSchema).optional(),
});

export type RejectReasonWeek = z.infer<typeof rejectReasonWeekSchema>;
export type RejectReasonTypeBreakdown = z.infer<typeof rejectReasonTypeBreakdownSchema>;
export type RejectReasonSubject = z.infer<typeof rejectReasonSubjectSchema>;
export type RejectReasonsStatistics = z.infer<typeof rejectReasonsStatisticsSchema>;
