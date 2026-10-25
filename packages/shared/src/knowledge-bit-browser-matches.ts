import { z } from "zod";
import { knowledgeBitBrowserItemSchema, knowledgeBitBrowserPagingSchema } from "./knowledge-bit-browser";
import { parseKnowledgeBitBrowserFilters, type KnowledgeBitBrowserFilters } from "./knowledge-bit-browser-filters";

export const KNOWLEDGE_BIT_MATCHES_MAX = 100;
export const KNOWLEDGE_BIT_MATCHES_MIN_SIMILARITY = 0.3;
export const KNOWLEDGE_BIT_MATCHES_QUERY_MAX = 300;

export const knowledgeBitBrowserMatchesWordsSchema = z.object({
  q: z.string().trim().min(1).max(KNOWLEDGE_BIT_MATCHES_QUERY_MAX),
  subjectId: knowledgeBitBrowserPagingSchema.shape.subjectId,
});

export type KnowledgeBitBrowserMatchesQuery = z.infer<typeof knowledgeBitBrowserMatchesWordsSchema> &
  KnowledgeBitBrowserFilters;

export const knowledgeBitBrowserMatchesQuerySchema = z
  .record(z.unknown())
  .transform((raw, ctx): KnowledgeBitBrowserMatchesQuery => {
    const words = knowledgeBitBrowserMatchesWordsSchema.safeParse(raw);

    if (!words.success) {
      words.error.issues.forEach((issue) => ctx.addIssue(issue));

      return z.NEVER;
    }

    return { ...words.data, ...parseKnowledgeBitBrowserFilters(raw) };
  });

export const knowledgeBitBrowserMatchSchema = knowledgeBitBrowserItemSchema.extend({
  similarity: z.number().min(0).max(1),
});

export type KnowledgeBitBrowserMatch = z.infer<typeof knowledgeBitBrowserMatchSchema>;

export const knowledgeBitBrowserMatchesSchema = z.object({
  items: z.array(knowledgeBitBrowserMatchSchema).max(KNOWLEDGE_BIT_MATCHES_MAX),
  readyCount: z.number().int().min(0),
  notReadyCount: z.number().int().min(0),
  capped: z.boolean(),
});

export type KnowledgeBitBrowserMatches = z.infer<typeof knowledgeBitBrowserMatchesSchema>;

export const knowledgeBitBrowserMatchesErrorCodes = [
  "invalid_input",
  "invalid_date_range",
  "search_rate_limited",
  "embedding_failed",
  "llm_budget_exceeded",
] as const;

export type KnowledgeBitBrowserMatchesErrorCode = (typeof knowledgeBitBrowserMatchesErrorCodes)[number];
