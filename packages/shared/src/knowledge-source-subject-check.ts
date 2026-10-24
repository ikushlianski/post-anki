import { z } from "zod";

export const SUBJECT_CHECK_MAX_BLOCKS = 5;
export const SUBJECT_CHECK_MAX_EXCERPT_CHARS = 1_500;
export const SUBJECT_CHECK_MAX_TOTAL_CHARS = 4_000;
export const SUBJECT_CHECK_MAX_RECOMMENDATIONS = 3;

const blockSchema = z.object({
  type: z.enum(["text", "url"]),
  value: z.string().trim().min(1).max(SUBJECT_CHECK_MAX_EXCERPT_CHARS),
});

export const subjectCheckRequestSchema = z
  .object({
    blocks: z.array(blockSchema).min(1).max(SUBJECT_CHECK_MAX_BLOCKS),
    parentSubjectId: z.string().min(1).optional(),
  })
  .refine((request) => request.blocks.reduce((sum, block) => sum + block.value.length, 0) <= SUBJECT_CHECK_MAX_TOTAL_CHARS, {
    message: "Excerpts are too long in total",
  });

export type SubjectCheckRequest = z.infer<typeof subjectCheckRequestSchema>;

export const subjectCheckConfidenceSchema = z.enum(["high", "medium", "low"]);

export type SubjectCheckConfidence = z.infer<typeof subjectCheckConfidenceSchema>;

export const subjectCheckRecommendationSchema = z.object({
  subjectId: z.string().min(1),
  subjectLabel: z.string().min(1),
  confidence: subjectCheckConfidenceSchema,
  reason: z.string(),
});

export type SubjectCheckRecommendation = z.infer<typeof subjectCheckRecommendationSchema>;

export const subjectCheckNewSubjectSchema = z.object({
  name: z.string().min(1),
  parentSubjectId: z.string().min(1).nullable(),
  parentLabel: z.string().nullable(),
  kind: z.enum(["business", "language", "general"]),
  reason: z.string(),
});

export type SubjectCheckNewSubject = z.infer<typeof subjectCheckNewSubjectSchema>;

export const subjectCheckUnavailableReasonSchema = z.enum(["disabled", "budget", "rate_limited", "timeout", "failed"]);

export type SubjectCheckUnavailableReason = z.infer<typeof subjectCheckUnavailableReasonSchema>;

export const subjectCheckResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    recommendations: z.array(subjectCheckRecommendationSchema).max(SUBJECT_CHECK_MAX_RECOMMENDATIONS),
    newSubject: subjectCheckNewSubjectSchema.nullable(),
  }),
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("unavailable"), reason: subjectCheckUnavailableReasonSchema }),
]);

export type SubjectCheckResponse = z.infer<typeof subjectCheckResponseSchema>;
