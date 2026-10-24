import { z } from "zod";
import { listKnowledgeSourcesPage } from "../knowledge-source/knowledge-source-mcp.repo.js";
import { buildSourceLabel } from "./knowledge-source-label.js";

export const LIST_KNOWLEDGE_SOURCES_DEFAULT_LIMIT = 50;
export const LIST_KNOWLEDGE_SOURCES_MAX_LIMIT = 200;

export const listKnowledgeSourcesInputSchema = z.object({
  subjectId: z.string().min(1).optional().describe("Only return sources filed under this subject"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Max items to return, default ${LIST_KNOWLEDGE_SOURCES_DEFAULT_LIMIT}, clamped to ${LIST_KNOWLEDGE_SOURCES_MAX_LIMIT}`,
    ),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type ListKnowledgeSourcesInput = z.infer<typeof listKnowledgeSourcesInputSchema>;

export const listKnowledgeSourcesItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  sourceUrl: z.string().nullable(),
  subjectId: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  approvedBitCount: z.number(),
});

export const listKnowledgeSourcesResultSchema = z.object({
  items: z.array(listKnowledgeSourcesItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListKnowledgeSourcesItem = z.infer<typeof listKnowledgeSourcesItemSchema>;
export type ListKnowledgeSourcesResult = z.infer<typeof listKnowledgeSourcesResultSchema>;

export async function listKnowledgeSources(
  input: ListKnowledgeSourcesInput,
): Promise<ListKnowledgeSourcesResult> {
  const limit = Math.min(
    Math.max(input.limit ?? LIST_KNOWLEDGE_SOURCES_DEFAULT_LIMIT, 0),
    LIST_KNOWLEDGE_SOURCES_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const { rows, total } = await listKnowledgeSourcesPage({
    subjectId: input.subjectId,
    limit,
    offset,
  });

  const items = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: buildSourceLabel(row),
    sourceUrl: row.sourceUrl,
    subjectId: row.subjectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    approvedBitCount: row.approvedBitCount,
  }));

  return { items, total, limit, offset };
}
