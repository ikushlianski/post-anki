import { z } from "zod";
import {
  knowledgeBitBrowserAddedByValues,
  knowledgeBitBrowserOriginValues,
} from "./knowledge-bit-browser-filters";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";
import { knowledgeBitOverviewStateSchema } from "./knowledge-bit-overview";

export const KNOWLEDGE_BIT_VARIANT_KIND_LABELS = {
  basic: "Basic",
  wh_question: "Why question",
  fill_in_the_blank: "Fill in the blank",
} as const satisfies Record<z.infer<typeof knowledgeBitQuestionVariantKindSchema>, string>;

export const knowledgeBitDetailPhrasingSchema = z.object({
  id: z.string(),
  kind: knowledgeBitQuestionVariantKindSchema,
  kindLabel: z.string(),
  prompt: z.string(),
  answer: z.string(),
  sentence: z.string().nullable(),
});

export type KnowledgeBitDetailPhrasing = z.infer<typeof knowledgeBitDetailPhrasingSchema>;

export const knowledgeBitDetailReviewSchema = z.object({
  state: knowledgeBitOverviewStateSchema,
  dueAt: z.string().nullable(),
  lapses: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
});

export type KnowledgeBitDetailReview = z.infer<typeof knowledgeBitDetailReviewSchema>;

export const knowledgeBitDetailSchema = z.object({
  knowledgeBitId: z.string(),
  body: z.string(),
  context: z.string().nullable(),
  phrasings: z.array(knowledgeBitDetailPhrasingSchema).min(1),
  subjectPath: z.array(z.string()),
  tags: z.array(z.string()),
  origin: z.enum(knowledgeBitBrowserOriginValues),
  addedBy: z.enum(knowledgeBitBrowserAddedByValues),
  sourceId: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  addedAt: z.string(),
  review: knowledgeBitDetailReviewSchema,
});

export type KnowledgeBitDetail = z.infer<typeof knowledgeBitDetailSchema>;
