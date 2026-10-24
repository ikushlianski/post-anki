import { z } from "zod";

// knowledge_bits.origin
export const knowledgeBitOriginSchema = z.enum(["extracted", "manual"]);

export type KnowledgeBitOrigin = z.infer<typeof knowledgeBitOriginSchema>;

// POST|DELETE /knowledge-sources/:id/processed
export const knowledgeSourceProcessedResponse = z.object({
  id: z.string().min(1),
  processedAt: z.string().nullable(),
});

export type KnowledgeSourceProcessedResponse = z.infer<typeof knowledgeSourceProcessedResponse>;
