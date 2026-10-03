import { z } from "zod";

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
export const knowledgeBitQuestionVariantKindSchema = z.enum(["wh_question", "fill_in_the_blank"]);

export type KnowledgeBitQuestionVariantKind = z.infer<typeof knowledgeBitQuestionVariantKindSchema>;

// knowledge_bits.approval_state
export const knowledgeBitApprovalStateSchema = z.enum(["pending", "approved", "rejected"]);

export type KnowledgeBitApprovalState = z.infer<typeof knowledgeBitApprovalStateSchema>;

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
