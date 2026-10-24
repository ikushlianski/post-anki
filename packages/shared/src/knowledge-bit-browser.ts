import { z } from "zod";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";

export const KNOWLEDGE_BIT_BROWSER_NO_SUBJECT = "none";

export const knowledgeBitBrowserQuerySchema = z.object({
  subjectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type KnowledgeBitBrowserQuery = z.infer<typeof knowledgeBitBrowserQuerySchema>;

export const knowledgeBitBrowserOriginSchema = z.enum([
  "manual",
  "ai_web",
  "pasted",
  "notion",
  "article",
]);

export type KnowledgeBitBrowserOrigin = z.infer<typeof knowledgeBitBrowserOriginSchema>;

export const knowledgeBitBrowserItemSchema = z.object({
  knowledgeBitId: z.string(),
  phrasings: z
    .array(
      z.object({
        id: z.string(),
        kind: knowledgeBitQuestionVariantKindSchema,
        prompt: z.string(),
      }),
    )
    .min(1),
  answer: z.string(),
  origin: knowledgeBitBrowserOriginSchema,
  addedAt: z.string(),
});

export type KnowledgeBitBrowserItem = z.infer<typeof knowledgeBitBrowserItemSchema>;

export const knowledgeBitBrowserPageSchema = z.object({
  items: z.array(knowledgeBitBrowserItemSchema),
  hasMore: z.boolean(),
});

export type KnowledgeBitBrowserPage = z.infer<typeof knowledgeBitBrowserPageSchema>;

export const knowledgeBitBrowserSubjectCountsSchema = z.array(
  z.object({
    subjectId: z.string().nullable(),
    count: z.number().int().min(0),
  }),
);

export type KnowledgeBitBrowserSubjectCounts = z.infer<typeof knowledgeBitBrowserSubjectCountsSchema>;
