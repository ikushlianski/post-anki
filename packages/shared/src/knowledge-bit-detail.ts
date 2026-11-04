import { z } from "zod";
import {
  knowledgeBitBrowserAddedByValues,
  knowledgeBitBrowserOriginValues,
} from "./knowledge-bit-browser-filters";
import { knowledgeBitQuestionVariantKindSchema } from "./knowledge-bit";
import { knowledgeBitOverviewStateSchema } from "./knowledge-bit-overview";
import { cardKeySchema } from "./card-key";

export const KNOWLEDGE_BIT_VARIANT_KIND_LABELS = {
  basic: "Basic",
  wh_question: "Why question",
  fill_in_the_blank: "Fill in the blank",
  cloze: "Cloze",
  list_step: "List step",
  list_next: "Next step",
  list_overview: "List overview",
} as const satisfies Record<z.infer<typeof knowledgeBitQuestionVariantKindSchema>, string>;

export const knowledgeBitDetailPhrasingSchema = z.object({
  id: z.string(),
  kind: knowledgeBitQuestionVariantKindSchema,
  kindLabel: z.string(),
  prompt: z.string(),
  context: z.string().nullable().optional(),
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

export const knowledgeBitDetailCardSchema = z.object({
  variantId: z.string(),
  cardKey: cardKeySchema,
  kind: knowledgeBitQuestionVariantKindSchema,
  order: z.number().int().min(0),
  state: knowledgeBitOverviewStateSchema,
  dueAt: z.string().nullable(),
  lapses: z.number().int().min(0),
  suspended: z.boolean(),
  buried: z.boolean(),
});

export type KnowledgeBitDetailCard = z.infer<typeof knowledgeBitDetailCardSchema>;

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
  isPhrase: z.boolean().optional(),
  sourceLabel: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  addedAt: z.string(),
  review: knowledgeBitDetailReviewSchema,
  cards: z.array(knowledgeBitDetailCardSchema).optional(),
});

export type KnowledgeBitDetail = z.infer<typeof knowledgeBitDetailSchema>;
