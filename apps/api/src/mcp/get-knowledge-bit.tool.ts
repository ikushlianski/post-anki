import { z } from "zod";
import {
  getKnowledgeBitForMcp,
  getKnowledgeSourceForMcp,
  listActiveVariantsForBits,
} from "../knowledge-source/knowledge-source-mcp.repo.js";
import { knowledgeBitVariantSchema } from "./knowledge-bit-variants.js";
import { buildSourceLabel } from "./knowledge-source-label.js";

export const getKnowledgeBitInputSchema = z.object({
  id: z.string().min(1).describe("Knowledge bit id, e.g. from search_knowledge_items"),
});

export type GetKnowledgeBitInput = z.infer<typeof getKnowledgeBitInputSchema>;

export const getKnowledgeBitResultSchema = z.object({
  id: z.string(),
  body: z.string(),
  background: z.string().nullable(),
  sourceLinks: z.array(z.string()),
  topicId: z.string().nullable(),
  approvalState: z.string(),
  source: z
    .object({
      id: z.string(),
      label: z.string(),
      sourceUrl: z.string().nullable(),
    })
    .nullable(),
  questions: z.array(knowledgeBitVariantSchema),
});

export type GetKnowledgeBitResult = z.infer<typeof getKnowledgeBitResultSchema>;

export type GetKnowledgeBitError = "not_found";

export async function getKnowledgeBit(
  input: GetKnowledgeBitInput,
): Promise<GetKnowledgeBitResult | { error: GetKnowledgeBitError }> {
  const bit = await getKnowledgeBitForMcp(input.id);

  if (!bit) {
    return { error: "not_found" };
  }

  const source = await getKnowledgeSourceForMcp(bit.knowledgeSourceId);
  const variants = await listActiveVariantsForBits([bit.id]);

  return {
    id: bit.id,
    body: bit.body,
    background: bit.background,
    sourceLinks: bit.sourceLinks ?? [],
    topicId: bit.topicId,
    approvalState: bit.approvalState,
    source: source
      ? { id: source.id, label: buildSourceLabel(source), sourceUrl: source.sourceUrl }
      : null,
    questions: variants.map((variant) => ({
      kind: variant.kind,
      prompt: variant.prompt,
      answer: variant.answer,
      sentence: variant.sentence,
    })),
  };
}
