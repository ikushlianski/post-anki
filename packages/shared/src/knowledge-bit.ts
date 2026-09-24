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

// knowledge_bit_question_variants.kind — a later item adds "fill_in_the_blank" reusing this table.
export const knowledgeBitQuestionVariantKindSchema = z.enum(["wh_question"]);

export type KnowledgeBitQuestionVariantKind = z.infer<typeof knowledgeBitQuestionVariantKindSchema>;
