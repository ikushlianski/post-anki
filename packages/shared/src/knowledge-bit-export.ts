import { z } from "zod";

export const KNOWLEDGE_BIT_EXPORT_FORMATS = ["json", "csv"] as const;

export const knowledgeBitExportQuerySchema = z.object({
  format: z.enum(KNOWLEDGE_BIT_EXPORT_FORMATS).default("json"),
});

export type KnowledgeBitExportQuery = z.infer<typeof knowledgeBitExportQuerySchema>;
export type KnowledgeBitExportFormat = KnowledgeBitExportQuery["format"];
