import { z } from "zod";
import type { McpVariantRow } from "../knowledge-source/knowledge-source-mcp.repo.js";

export const knowledgeBitVariantSchema = z.object({
  kind: z.string(),
  prompt: z.string(),
  answer: z.string(),
  sentence: z.string().nullable(),
});

export type KnowledgeBitVariant = z.infer<typeof knowledgeBitVariantSchema>;

export function groupVariantsByBit(rows: McpVariantRow[]): Map<string, KnowledgeBitVariant[]> {
  const byBit = new Map<string, KnowledgeBitVariant[]>();

  for (const row of rows) {
    const list = byBit.get(row.knowledgeBitId) ?? [];

    list.push({ kind: row.kind, prompt: row.prompt, answer: row.answer, sentence: row.sentence });
    byBit.set(row.knowledgeBitId, list);
  }

  return byBit;
}
