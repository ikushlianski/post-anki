import { z } from "zod";

export const KNOWLEDGE_PURGE_MAX_IDS = 500;
export const CLEAR_ALL_KNOWLEDGE_CONFIRMATION = "DELETE ALL KNOWLEDGE";

export const purgeKnowledgeBitsInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(KNOWLEDGE_PURGE_MAX_IDS),
});

export type PurgeKnowledgeBitsInput = z.input<typeof purgeKnowledgeBitsInput>;

export const clearAllKnowledgeInput = z.object({
  confirm: z.literal(CLEAR_ALL_KNOWLEDGE_CONFIRMATION),
});

export type ClearAllKnowledgeInput = z.input<typeof clearAllKnowledgeInput>;

export const knowledgeDeletionCountsSchema = z.object({
  knowledgeBits: z.number().int().min(0),
  questionVariants: z.number().int().min(0),
  variantAttempts: z.number().int().min(0),
  schedules: z.number().int().min(0),
  reviews: z.number().int().min(0),
  feedback: z.number().int().min(0),
  tagAssignments: z.number().int().min(0),
  knowledgeSources: z.number().int().min(0),
  extractionGrades: z.number().int().min(0),
  topicCardVariants: z.number().int().min(0),
  facts: z.number().int().min(0),
  triageSessions: z.number().int().min(0),
});

export type KnowledgeDeletionCounts = z.infer<typeof knowledgeDeletionCountsSchema>;

export const knowledgeDeletionResponseSchema = z.object({
  counts: knowledgeDeletionCountsSchema,
});

export type KnowledgeDeletionResponse = z.infer<typeof knowledgeDeletionResponseSchema>;
