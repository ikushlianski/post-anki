import { z } from "zod";

export const KNOWLEDGE_BIT_BULK_MAX_IDS = 200;

export const knowledgeBitOverviewQuerySchema = z.object({
  subjectId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type KnowledgeBitOverviewQuery = z.infer<typeof knowledgeBitOverviewQuerySchema>;

export const knowledgeBitOverviewStateSchema = z.enum([
  "new",
  "learning",
  "review",
  "relearning",
  "suspended",
  "buried",
]);

export type KnowledgeBitOverviewState = z.infer<typeof knowledgeBitOverviewStateSchema>;

export const knowledgeBitOverviewItemSchema = z.object({
  knowledgeBitId: z.string(),
  question: z.string(),
  answer: z.string(),
  subjectId: z.string().nullable(),
  state: knowledgeBitOverviewStateSchema,
  dueAt: z.string().nullable(),
  lapses: z.number().int().min(0),
  sourceLinks: z.array(z.string()).default([]),
});

export type KnowledgeBitOverviewItem = z.infer<typeof knowledgeBitOverviewItemSchema>;

export const knowledgeBitOverviewPageSchema = z.object({
  items: z.array(knowledgeBitOverviewItemSchema),
  hasMore: z.boolean(),
});

export type KnowledgeBitOverviewPage = z.infer<typeof knowledgeBitOverviewPageSchema>;

const knowledgeBitIdsSchema = z.array(z.string().min(1)).min(1).max(KNOWLEDGE_BIT_BULK_MAX_IDS);

export const knowledgeBitBulkSkipReasonSchema = z.enum(["not_found", "not_approved", "curriculum_placed"]);

export type KnowledgeBitBulkSkipReason = z.infer<typeof knowledgeBitBulkSkipReasonSchema>;

const knowledgeBitBulkSkippedSchema = z.array(
  z.object({ id: z.string(), reason: knowledgeBitBulkSkipReasonSchema }),
);

export const bulkDeleteKnowledgeBitsInput = z.object({
  knowledgeBitIds: knowledgeBitIdsSchema,
});

export type BulkDeleteKnowledgeBitsInput = z.input<typeof bulkDeleteKnowledgeBitsInput>;

export const bulkDeleteKnowledgeBitsResponseSchema = z.object({
  deleted: z.array(z.string()),
  skipped: knowledgeBitBulkSkippedSchema,
});

export type BulkDeleteKnowledgeBitsResponse = z.infer<typeof bulkDeleteKnowledgeBitsResponseSchema>;

export const bulkMoveKnowledgeBitsInput = z.object({
  knowledgeBitIds: knowledgeBitIdsSchema,
  subjectId: z.string().min(1),
});

export type BulkMoveKnowledgeBitsInput = z.input<typeof bulkMoveKnowledgeBitsInput>;

export const bulkMoveKnowledgeBitsResponseSchema = z.object({
  moved: z.array(z.string()),
  skipped: knowledgeBitBulkSkippedSchema,
});

export type BulkMoveKnowledgeBitsResponse = z.infer<typeof bulkMoveKnowledgeBitsResponseSchema>;
