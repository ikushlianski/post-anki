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

export const searchResultTagSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SearchResultTag = z.infer<typeof searchResultTagSchema>;

export const topicModuleSearchResultSchema = z.object({
  id: z.string(),
  kind: z.enum(["topic", "module", "bit"]),
  title: z.string(),
  curriculumId: z.string().nullable(),
  curriculumName: z.string().nullable(),
  rank: z.number(),
  tags: z.array(searchResultTagSchema),
});

export type TopicModuleSearchResult = z.infer<typeof topicModuleSearchResultSchema>;

export const listTagNodesResponseSchema = z.object({
  nodes: z.array(topicModuleSearchResultSchema),
  capped: z.boolean(),
});

export type ListTagNodesResponse = z.infer<typeof listTagNodesResponseSchema>;
