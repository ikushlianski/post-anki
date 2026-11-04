import { z } from "zod";
import { MAX_CARD_EXAMPLE_CHARS } from "./knowledge-bit-chat";

export const EXAMPLE_AI_MAX_GENERATIONS = 5;

export const moveToInboxResultSchema = z.object({
  ok: z.literal(true),
  inboxCount: z.number().int().min(0),
});

export type MoveToInboxResult = z.infer<typeof moveToInboxResultSchema>;

export const returnFromInboxResultSchema = z.object({ ok: z.literal(true) });

export type ReturnFromInboxResult = z.infer<typeof returnFromInboxResultSchema>;

export const discardFromInboxResultSchema = z.object({ ok: z.literal(true) });

export type DiscardFromInboxResult = z.infer<typeof discardFromInboxResultSchema>;

export const inboxNoteSourceSchema = z.object({
  variantId: z.string().min(1),
  mode: z.enum(["cloze", "list"]),
  text: z.string().min(1),
});

export type InboxNoteSource = z.infer<typeof inboxNoteSourceSchema>;

export const inboxKnowledgeBitSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  background: z.string().nullable(),
  exampleAiGeneratedAt: z.string().nullable(),
  origin: z.enum(["extracted", "manual"]),
  subjectName: z.string().nullable(),
  cardCount: z.number().int().min(0),
  inboxAt: z.string(),
  note: inboxNoteSourceSchema.nullable().default(null),
});

export type InboxKnowledgeBit = z.infer<typeof inboxKnowledgeBitSchema>;

export const inboxKnowledgeBitListSchema = z.object({
  items: z.array(inboxKnowledgeBitSchema),
  count: z.number().int().min(0),
  total: z.number().int().min(0).optional(),
  hasMore: z.boolean().optional(),
});

export type InboxKnowledgeBitList = z.infer<typeof inboxKnowledgeBitListSchema>;

export const generateKnowledgeBitExampleInput = z.object({
  overwrite: z.boolean().optional().default(false),
});

export type GenerateKnowledgeBitExampleInput = z.input<typeof generateKnowledgeBitExampleInput>;

export const generateKnowledgeBitExampleResultSchema = z.object({
  knowledgeBitId: z.string().min(1),
  example: z.string().min(1).max(MAX_CARD_EXAMPLE_CHARS),
  exampleAiGeneratedAt: z.string(),
  previousExample: z.string().nullable(),
  generationsLeft: z.number().int().min(0).max(EXAMPLE_AI_MAX_GENERATIONS),
});

export type GenerateKnowledgeBitExampleResult = z.infer<typeof generateKnowledgeBitExampleResultSchema>;

export const knowledgeBitExampleErrorSchema = z.enum([
  "not_found",
  "blocked",
  "example_exists",
  "limit_reached",
  "generation_failed",
  "budget_exceeded",
]);

export type KnowledgeBitExampleError = z.infer<typeof knowledgeBitExampleErrorSchema>;
