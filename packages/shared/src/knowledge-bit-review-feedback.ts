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

// PATCH /knowledge-bit-feedback/:id
export const setKnowledgeBitFeedbackReasonInput = z.object({
  reasonCode: knowledgeBitRejectReasonSchema,
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
});

export type SetKnowledgeBitFeedbackReasonInput = z.input<typeof setKnowledgeBitFeedbackReasonInput>;

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
