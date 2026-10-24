import { z } from "zod";
import {
  getKnowledgeSourceForMcp,
  listActiveVariantsForBits,
  listApprovedBitsForSourcePage,
} from "../knowledge-source/knowledge-source-mcp.repo.js";
import { groupVariantsByBit, knowledgeBitVariantSchema } from "./knowledge-bit-variants.js";

export const GET_SOURCE_KNOWLEDGE_BITS_DEFAULT_LIMIT = 50;
export const GET_SOURCE_KNOWLEDGE_BITS_MAX_LIMIT = 200;

export const getSourceKnowledgeBitsInputSchema = z.object({
  sourceId: z.string().min(1).describe("Knowledge source id, e.g. from list_knowledge_sources"),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Max items to return, default ${GET_SOURCE_KNOWLEDGE_BITS_DEFAULT_LIMIT}, clamped to ${GET_SOURCE_KNOWLEDGE_BITS_MAX_LIMIT}`,
    ),
  offset: z.number().int().min(0).optional().describe("Items to skip, default 0"),
});

export type GetSourceKnowledgeBitsInput = z.infer<typeof getSourceKnowledgeBitsInputSchema>;

export const getSourceKnowledgeBitsItemSchema = z.object({
  id: z.string(),
  body: z.string(),
  background: z.string().nullable(),
  sourceLinks: z.array(z.string()),
  topicId: z.string().nullable(),
  questions: z.array(knowledgeBitVariantSchema),
});

export const getSourceKnowledgeBitsResultSchema = z.object({
  items: z.array(getSourceKnowledgeBitsItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type GetSourceKnowledgeBitsItem = z.infer<typeof getSourceKnowledgeBitsItemSchema>;
export type GetSourceKnowledgeBitsResult = z.infer<typeof getSourceKnowledgeBitsResultSchema>;

export type GetSourceKnowledgeBitsError = "not_found";

export async function getSourceKnowledgeBits(
  input: GetSourceKnowledgeBitsInput,
): Promise<GetSourceKnowledgeBitsResult | { error: GetSourceKnowledgeBitsError }> {
  const source = await getKnowledgeSourceForMcp(input.sourceId);

  if (!source) {
    return { error: "not_found" };
  }

  const limit = Math.min(
    Math.max(input.limit ?? GET_SOURCE_KNOWLEDGE_BITS_DEFAULT_LIMIT, 0),
    GET_SOURCE_KNOWLEDGE_BITS_MAX_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);

  const { rows, total } = await listApprovedBitsForSourcePage(input.sourceId, limit, offset);
  const variants = await listActiveVariantsForBits(rows.map((bit) => bit.id));
  const variantsByBit = groupVariantsByBit(variants);

  const items = rows.map((bit) => ({
    id: bit.id,
    body: bit.body,
    background: bit.background,
    sourceLinks: bit.sourceLinks ?? [],
    topicId: bit.topicId,
    questions: variantsByBit.get(bit.id) ?? [],
  }));

  return { items, total, limit, offset };
}
