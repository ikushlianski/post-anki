import { z } from "zod";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";
import {
  knowledgeBitBrowserOriginValues,
  parseKnowledgeBitBrowserFilters,
  type KnowledgeBitBrowserFilters,
} from "./knowledge-bit-browser-filters";

export const KNOWLEDGE_BIT_BROWSER_NO_SUBJECT = "none";

export const knowledgeBitBrowserPagingSchema = z.object({
  subjectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type KnowledgeBitBrowserQuery = z.infer<typeof knowledgeBitBrowserPagingSchema> &
  KnowledgeBitBrowserFilters;

export const knowledgeBitBrowserQuerySchema = z
  .record(z.unknown())
  .transform((raw, ctx): KnowledgeBitBrowserQuery => {
    const paging = knowledgeBitBrowserPagingSchema.safeParse(raw);

    if (!paging.success) {
      paging.error.issues.forEach((issue) => ctx.addIssue(issue));

      return z.NEVER;
    }

    return { ...paging.data, ...parseKnowledgeBitBrowserFilters(raw) };
  });

export const knowledgeBitBrowserOriginSchema = z.enum(knowledgeBitBrowserOriginValues);

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
  sourceId: z.string().nullable().optional(),
  sourceLabel: z.string().max(80).nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  addedAt: z.string(),
  sourcePieceCount: z.number().int().min(0),
});

export type KnowledgeBitBrowserItem = z.infer<typeof knowledgeBitBrowserItemSchema>;

export const knowledgeBitBrowserPageSchema = z.object({
  items: z.array(knowledgeBitBrowserItemSchema),
  hasMore: z.boolean(),
  total: z.number().int().min(0),
});

export type KnowledgeBitBrowserPage = z.infer<typeof knowledgeBitBrowserPageSchema>;

export const knowledgeBitBrowserSubjectCountsSchema = z.array(
  z.object({
    subjectId: z.string().nullable(),
    count: z.number().int().min(0),
  }),
);

export type KnowledgeBitBrowserSubjectCounts = z.infer<typeof knowledgeBitBrowserSubjectCountsSchema>;
