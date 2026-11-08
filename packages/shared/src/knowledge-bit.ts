import { z } from "zod";
import { CARD_TEXT_MAX_CHARS } from "./text-limits";
import { editClozeNoteInput } from "./cloze";
import { editOrderedListInput } from "./ordered-list";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";
import type { KnowledgeSourceAttention } from "./extraction-failure";
import { KNOWLEDGE_SOURCE_MAX_CHARS } from "./knowledge-source-refusal";
import { subjectCheckConfidenceSchema, type SubjectCheckConfidence } from "./knowledge-source-subject-check";
import type { KnowledgeBitRejectReason } from "./knowledge-bit-review-feedback";

// knowledge_bit_question_variants.kind
export const knowledgeBitQuestionVariantKindSchema = z.enum([
  "wh_question",
  "fill_in_the_blank",
  "basic",
  "cloze",
  "list_step",
  "list_next",
  "list_overview",
]);

export type KnowledgeBitQuestionVariantKind = z.infer<typeof knowledgeBitQuestionVariantKindSchema>;

// knowledge_bits.approval_state
export const knowledgeBitApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "superseded",
  "inbox",
  "chat",
]);

export type KnowledgeBitApprovalState = z.infer<typeof knowledgeBitApprovalStateSchema>;

// POST /knowledge-sources/:id/regeneration
export const regenerateKnowledgeSourceInput = z.object({
  modelId: knowledgeItemModelIdSchema.optional(),
  text: z.string().trim().min(1).max(KNOWLEDGE_SOURCE_MAX_CHARS).optional(),
  forceAtLeastOne: z.boolean().optional(),
});

export type RegenerateKnowledgeSourceInput = z.input<typeof regenerateKnowledgeSourceInput>;

export interface RegenerateKnowledgeSourceResult {
  status: "running";
  supersededCount: number;
}

// GET /knowledge-sources/:id/regeneration
export interface KnowledgeSourceRegenerationStatus {
  status: "running" | "done" | "nothing_extracted" | "failed";
  failureReason: string | null;
  outcome?: "cards" | "nothing" | "failed";
  cardCount?: number;
}

// PATCH /knowledge-bits/question-variants/:id
export const editKnowledgeBitQuestionVariantInput = z.union([
  z.object({
    prompt: z.string().trim().min(1).max(CARD_TEXT_MAX_CHARS),
    context: z.string().trim().max(CARD_TEXT_MAX_CHARS).nullable().optional(),
    answer: z.string().trim().min(1).max(CARD_TEXT_MAX_CHARS),
  }),
  editClozeNoteInput,
  editOrderedListInput,
]);

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
  context?: string | null;
  answer: string;
  sentence?: string | null;
}

export interface PendingKnowledgeBitFeedback {
  feedbackId: string;
  verdict: "approved" | "rejected";
  rating: number | null;
  wordingRating: number | null;
}

export const pendingKnowledgeBitDuplicateOfSchema = z.object({
  bitId: z.string().min(1),
  front: z.string(),
  back: z.string().nullable(),
  similarity: z.number().min(0).max(1),
  reason: z.string().nullable(),
  similarBitIds: z.array(z.string().min(1)),
});

export type PendingKnowledgeBitDuplicateOf = z.infer<typeof pendingKnowledgeBitDuplicateOfSchema>;

export interface PendingKnowledgeBitForReview {
  id: string;
  createdAt?: string;
  body: string;
  background: string | null;
  variants: PendingKnowledgeBitQuestionVariant[];
  exampleAiGeneratedAt?: string | null;
  origin: "extracted" | "manual";
  isAiGenerated: boolean;
  sourceLinks: string[];
  reviewFlag?: string | null;
  aiSuggestion?: string | null;
  answerChoice?: boolean;
  feedback?: PendingKnowledgeBitFeedback | null;
  duplicateOf?: PendingKnowledgeBitDuplicateOf | null;
  modelIds?: string[];
}

export interface PendingKnowledgeSourceExtractionGrade {
  rating: number;
  note: string | null;
  run: number;
}

export const pendingSubjectSuggestionSchema = z.object({
  suggestedSubjectId: z.string().min(1).nullable(),
  suggestedSubjectName: z.string().min(1).nullable(),
  suggestedSubjectConfidence: subjectCheckConfidenceSchema.nullable(),
});

export interface PendingKnowledgeSourceForReview {
  knowledgeSourceId: string;
  sourceText: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  subjectName: string | null;
  subjectId?: string | null;
  suggestedSubjectId?: string | null;
  suggestedSubjectName?: string | null;
  suggestedSubjectConfidence?: SubjectCheckConfidence | null;
  rejectReasonCodes?: KnowledgeBitRejectReason[];
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
  inboxCount: z.number().int().min(0).default(0),
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

export const createClozeKnowledgeItemInput = z.object({
  note: editClozeNoteInput.shape.note.refine((value) => /\{\{c\d+::/i.test(value), {
    message: "A cloze note needs at least one {{c1::...}} gap",
  }),
  example: createManualKnowledgeItemInput.shape.example,
  aiGenerated: createManualKnowledgeItemInput.shape.aiGenerated,
  sourceLinks: createManualKnowledgeItemInput.shape.sourceLinks,
});

export type CreateClozeKnowledgeItemInput = z.input<typeof createClozeKnowledgeItemInput>;

export const createKnowledgeItemInput = z.union([
  createClozeKnowledgeItemInput,
  createManualKnowledgeItemInput,
]);

export type CreateKnowledgeItemInput = z.input<typeof createKnowledgeItemInput>;
