import { z } from "zod";

export const KNOWLEDGE_BIT_REJECT_REASONS = [
  "wrong_language",
  "too_vague_or_no_context",
  "meta_wording",
  "not_a_fact_or_trivial",
  "wrong_or_unsupported_answer",
  "duplicate_or_overlap",
  "bad_format",
  "other",
] as const;

export const knowledgeBitRejectReasonSchema = z.enum(KNOWLEDGE_BIT_REJECT_REASONS);

export type KnowledgeBitRejectReason = z.infer<typeof knowledgeBitRejectReasonSchema>;

export const KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED = "unspecified" as const;

export const knowledgeBitFeedbackReasonSchema = z.enum([
  ...KNOWLEDGE_BIT_REJECT_REASONS,
  KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED,
]);

export type KnowledgeBitFeedbackReason = z.infer<typeof knowledgeBitFeedbackReasonSchema>;

export const KNOWLEDGE_BIT_REJECT_REASON_LABELS: Record<KnowledgeBitFeedbackReason, string> = {
  wrong_language: "Wrong language",
  too_vague_or_no_context: "Too vague or no context",
  meta_wording: "Meta wording (\"according to the text\")",
  not_a_fact_or_trivial: "Not a fact or trivial",
  wrong_or_unsupported_answer: "Wrong or unsupported answer",
  duplicate_or_overlap: "Duplicate or overlaps another",
  bad_format: "Bad format (broken blank, yes/no)",
  other: "Other",
  unspecified: "No reason given",
};

export const KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS = 500;

export const knowledgeBitFeedbackVerdictSchema = z.enum(["rejected", "approved"]);

export type KnowledgeBitFeedbackVerdict = z.infer<typeof knowledgeBitFeedbackVerdictSchema>;

// PATCH /knowledge-bit-feedback/:id (legacy — requires reasonCode)
export const setKnowledgeBitFeedbackReasonInput = z.object({
  reasonCode: knowledgeBitRejectReasonSchema,
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
});

export type SetKnowledgeBitFeedbackReasonInput = z.input<typeof setKnowledgeBitFeedbackReasonInput>;

// PATCH /knowledge-bit-feedback/:id (partial update — any field optional)
export const updateKnowledgeBitFeedbackInput = z.object({
  reasonCode: knowledgeBitRejectReasonSchema.optional(),
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export type UpdateKnowledgeBitFeedbackInput = z.input<typeof updateKnowledgeBitFeedbackInput>;

// POST /knowledge-bits/:id/grades
export const gradeKnowledgeBitInput = z.object({
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
});

export type GradeKnowledgeBitInput = z.input<typeof gradeKnowledgeBitInput>;

export const gradeKnowledgeBitResponse = z.object({
  ok: z.literal(true),
  feedbackId: z.string(),
});

export type GradeKnowledgeBitResponse = z.infer<typeof gradeKnowledgeBitResponse>;

// POST /knowledge-bits/:id/reject
export const rejectKnowledgeBitResponse = z.object({
  ok: z.literal(true),
  feedbackId: z.string().nullable(),
});

export type RejectKnowledgeBitResponse = z.infer<typeof rejectKnowledgeBitResponse>;

// GET /admin/knowledge-bit-feedback/by-model
export interface KnowledgeBitFeedbackModelStats {
  modelId: string;
  approved: number;
  rejected: number;
  topReasons: Array<{ reasonCode: KnowledgeBitFeedbackReason; count: number }>;
}

export interface KnowledgeBitFeedbackByModelResponse {
  models: KnowledgeBitFeedbackModelStats[];
}

// Summary of the most recent feedback for a specific knowledge bit — surfaced in the review UI.
export interface KnowledgeBitFeedbackSummary {
  feedbackId: string;
  verdict: KnowledgeBitFeedbackVerdict;
  rating: number | null;
  wordingRating: number | null;
}

// PUT /knowledge-sources/:id/extraction-grade
export const setSourceExtractionGradeInput = z.object({
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
});

export type SetSourceExtractionGradeInput = z.input<typeof setSourceExtractionGradeInput>;

export interface SourceExtractionGrade {
  rating: number;
  note: string | null;
  run: number;
}
