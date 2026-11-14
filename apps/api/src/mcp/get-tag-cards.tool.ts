import { z } from "zod";
import { listNodesByTagId } from "../search/list-nodes-by-tag.repo.js";
import { getTag } from "../tag/tag.repo.js";

export const getTagCardsInputSchema = z.object({
  tagId: z.string().min(1).describe("Tag id from list_tags"),
});

export const getTagCardsResultSchema = z.object({
  tagId: z.string(),
  cards: z.array(z.object({ id: z.string(), title: z.string(), tags: z.array(z.string()) })),
  capped: z.boolean(),
});

export type GetTagCardsInput = z.infer<typeof getTagCardsInputSchema>;
export type GetTagCardsResult = z.infer<typeof getTagCardsResultSchema>;

export async function getTagCards(input: GetTagCardsInput): Promise<GetTagCardsResult | { error: "not_found" }> {
  if (!(await getTag(input.tagId))) {
    return { error: "not_found" };
  }

  const { nodes, capped } = await listNodesByTagId(input.tagId);

  return {
    tagId: input.tagId,
    cards: nodes
      .filter((node) => node.kind === "bit")
      .map((node) => ({ id: node.id, title: node.title, tags: node.tags.map((tag) => tag.name) })),
    capped,
  };
}
