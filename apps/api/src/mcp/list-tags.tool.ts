import { z } from "zod";
import { getAllTags } from "../tag/tag.service.js";

export const listTagsInputSchema = z.object({});

export const listTagsResultSchema = z.object({
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type ListTagsResult = z.infer<typeof listTagsResultSchema>;

export async function listAllTags(): Promise<ListTagsResult> {
  const tags = await getAllTags();

  return { tags: tags.map((tag) => ({ id: tag.id, name: tag.name })) };
}
