import { z } from "zod";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";

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

export interface PendingKnowledgeBitQuestionVariant {
  id: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
}

export interface PendingKnowledgeBitForReview {
  id: string;
  body: string;
  background: string | null;
  variants: PendingKnowledgeBitQuestionVariant[];
}

export interface PendingKnowledgeSourceForReview {
  knowledgeSourceId: string;
  sourceText: string | null;
  bits: PendingKnowledgeBitForReview[];
}

export const BULK_APPROVAL_MAX_IDS = 200;

// POST /knowledge-bits/approvals
export const bulkApproveKnowledgeBitsInput = z.object({
  knowledgeBitIds: z.array(z.string().min(1)).min(1).max(BULK_APPROVAL_MAX_IDS),
});

export type BulkApproveKnowledgeBitsInput = z.input<typeof bulkApproveKnowledgeBitsInput>;

export const bulkApprovalSkipReasonSchema = z.enum(["not_found", "already_decided", "no_variant"]);

export type BulkApprovalSkipReason = z.infer<typeof bulkApprovalSkipReasonSchema>;

export const bulkApproveKnowledgeBitsResponse = z.object({
  approved: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), reason: bulkApprovalSkipReasonSchema })),
});

export type BulkApproveKnowledgeBitsResponse = z.infer<typeof bulkApproveKnowledgeBitsResponse>;

// GET /knowledge-bits/pending-review/count
export const pendingKnowledgeBitReviewCountResponse = z.object({ count: z.number().int().min(0) });

export type PendingKnowledgeBitReviewCountResponse = z.infer<
  typeof pendingKnowledgeBitReviewCountResponse
>;
