import { z } from "zod";

export const searchResultItemSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const searchTopicResultSchema = searchResultItemSchema.extend({
  curriculumId: z.string(),
});

export type SearchTopicResult = z.infer<typeof searchTopicResultSchema>;

export const searchResponseSchema = z.object({
  subjects: z.array(searchResultItemSchema),
  curricula: z.array(searchResultItemSchema),
  topics: z.array(searchTopicResultSchema),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
