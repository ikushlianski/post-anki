import { z } from "zod";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";
import type { KnowledgeSourceAttention } from "./extraction-failure";

export interface PendingPlacementSuggestion {
  id: string;
  body: string;
  placementSuggestion: string;
}

// PATCH /knowledge-bits/:id/placement-suggestion
export const resolvePlacementSuggestionInput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    moduleId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({ status: z.literal("rejected") }),
]);

export type ResolvePlacementSuggestionInput = z.infer<typeof resolvePlacementSuggestionInput>;

// knowledge_bit_question_variants.kind
export const knowledgeBitQuestionVariantKindSchema = z.enum([
  "wh_question",
  "fill_in_the_blank",
  "basic",
]);

export type KnowledgeBitQuestionVariantKind = z.infer<typeof knowledgeBitQuestionVariantKindSchema>;

// knowledge_bits.approval_state
export const knowledgeBitApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "superseded",
]);

export type KnowledgeBitApprovalState = z.infer<typeof knowledgeBitApprovalStateSchema>;

// POST /knowledge-sources/:id/regeneration
export const regenerateKnowledgeSourceInput = z.object({
  modelId: knowledgeItemModelIdSchema.optional(),
});

export type RegenerateKnowledgeSourceInput = z.input<typeof regenerateKnowledgeSourceInput>;

export interface RegenerateKnowledgeSourceResult {
  status: "running";
  supersededCount: number;
}

// GET /knowledge-sources/:id/regeneration
export interface KnowledgeSourceRegenerationStatus {
  status: "running" | "done" | "failed";
  failureReason: string | null;
}

// PATCH /knowledge-bits/question-variants/:id
export const editKnowledgeBitQuestionVariantInput = z.object({
  prompt: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export type EditKnowledgeBitQuestionVariantInput = z.input<
  typeof editKnowledgeBitQuestionVariantInput
>;

// POST /knowledge-bits/:id/triage
export const TRIAGE_KEEP_VARIANTS_MAX = 20;

export const triageKnowledgeBitInput = z.object({
  keepVariantIds: z
    .array(z.string().min(1))
    .min(1)
    .max(TRIAGE_KEEP_VARIANTS_MAX)
    .refine((ids) => new Set(ids).size === ids.length),
});

export type TriageKnowledgeBitInput = z.input<typeof triageKnowledgeBitInput>;

export interface TriageKnowledgeBitResponse {
  ok: true;
  droppedVariantIds: string[];
}

// POST /knowledge-bits/:id/triage/undo
export const TRIAGE_UNDO_VARIANTS_MAX = 20;

export const undoTriageKnowledgeBitInput = z.object({
  restoreVariantIds: z
    .array(z.string().min(1))
    .min(1)
    .max(TRIAGE_UNDO_VARIANTS_MAX)
    .refine((ids) => new Set(ids).size === ids.length),
});

export type UndoTriageKnowledgeBitInput = z.input<typeof undoTriageKnowledgeBitInput>;

export interface PendingKnowledgeBitQuestionVariant {
  id: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
}

export interface PendingKnowledgeBitFeedback {
  feedbackId: string;
  verdict: "approved" | "rejected";
  rating: number | null;
  wordingRating: number | null;
}

export interface PendingKnowledgeBitForReview {
  id: string;
  body: string;
  background: string | null;
  variants: PendingKnowledgeBitQuestionVariant[];
  origin: "extracted" | "manual";
  isAiGenerated: boolean;
  sourceLinks: string[];
  reviewFlag?: string | null;
  feedback?: PendingKnowledgeBitFeedback | null;
}

export interface PendingKnowledgeSourceExtractionGrade {
  rating: number;
  note: string | null;
  run: number;
}

export interface PendingKnowledgeSourceForReview {
  knowledgeSourceId: string;
  sourceText: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  subjectName: string | null;
  subjectId?: string | null;
  bits: PendingKnowledgeBitForReview[];
  processedAt?: Date | string | null;
  groupTotal?: number;
  extractionRun?: number;
  extractionGrade?: PendingKnowledgeSourceExtractionGrade | null;
  decidedCount?: number;
  attention?: KnowledgeSourceAttention | null;
}

export const BULK_APPROVAL_MAX_IDS = 200;

// POST /knowledge-bits/approvals
export const bulkApproveKnowledgeBitsInput = z.object({
  knowledgeBitIds: z.array(z.string().min(1)).min(1).max(BULK_APPROVAL_MAX_IDS),
});

export type BulkApproveKnowledgeBitsInput = z.input<typeof bulkApproveKnowledgeBitsInput>;

export const bulkApprovalSkipReasonSchema = z.enum([
  "not_found",
  "already_decided",
  "no_variant",
  "needs_manual_review",
]);

export type BulkApprovalSkipReason = z.infer<typeof bulkApprovalSkipReasonSchema>;

export const bulkApproveKnowledgeBitsResponse = z.object({
  approved: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), reason: bulkApprovalSkipReasonSchema })),
});

export type BulkApproveKnowledgeBitsResponse = z.infer<typeof bulkApproveKnowledgeBitsResponse>;

// GET /knowledge-bits/pending-review/count
export const pendingKnowledgeBitReviewCountResponse = z.object({
  count: z.number().int().min(0),
  attentionCount: z.number().int().min(0).default(0),
});

export type PendingKnowledgeBitReviewCountResponse = z.infer<
  typeof pendingKnowledgeBitReviewCountResponse
>;

// POST /knowledge-sources/manual-items
export const MANUAL_ITEM_FRONT_MAX_CHARS = 300;
export const MANUAL_ITEM_BACK_MAX_CHARS = 600;
export const MANUAL_ITEM_EXAMPLE_MAX_CHARS = 300;
export const MANUAL_ITEM_SOURCE_LINKS_MAX = 5;
export const MANUAL_ITEM_SOURCE_LINK_MAX_CHARS = 500;

const sourceLinkSchema = z
  .string()
  .trim()
  .max(MANUAL_ITEM_SOURCE_LINK_MAX_CHARS)
  .url()
  .refine((value) => /^https?:\/\//i.test(value));

export const createManualKnowledgeItemInput = z.object({
  front: z.string().trim().min(1).max(MANUAL_ITEM_FRONT_MAX_CHARS),
  back: z.string().trim().min(1).max(MANUAL_ITEM_BACK_MAX_CHARS),
  example: z
    .string()
    .trim()
    .max(MANUAL_ITEM_EXAMPLE_MAX_CHARS)
    .nullable()
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : v)),
  aiGenerated: z.boolean().optional().default(false),
  sourceLinks: z.array(sourceLinkSchema).max(MANUAL_ITEM_SOURCE_LINKS_MAX).optional(),
});

export type CreateManualKnowledgeItemInput = z.input<typeof createManualKnowledgeItemInput>;
