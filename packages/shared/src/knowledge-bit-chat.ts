import { z } from "zod";
import { chatTranscriptSchema, MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_TRANSCRIPT_MESSAGES } from "./study-chat";

// Durable content like detect-knowledge-bits.orchestrator.ts's MAX_SOURCE_CHARS, not a chat turn.
export const MAX_KNOWLEDGE_BIT_BODY_CHARS = 50_000;

export const askKnowledgeBitChatInput = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  transcript: chatTranscriptSchema.optional(),
  allowGeneralKnowledge: z.boolean().optional().default(false),
  allowWebSearch: z.boolean().optional().default(false),
});

export type AskKnowledgeBitChatInput = z.input<typeof askKnowledgeBitChatInput>;

export const askKnowledgeBitChatResultSchema = z.object({
  reply: z.string(),
});

export type AskKnowledgeBitChatResult = z.infer<typeof askKnowledgeBitChatResultSchema>;

export const MAX_CARD_FRONT_CHARS = 300;
export const MAX_CARD_BACK_CHARS = 600;
export const MAX_CARD_EXAMPLE_CHARS = 300;
export const MAX_CARD_SOURCES = 5;
export const MAX_DRAFT_INSTRUCTION_CHARS = 2_000;
export const MAX_DRAFT_TRANSCRIPT_MESSAGES = MAX_CHAT_TRANSCRIPT_MESSAGES;

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "must be an http or https url");

export const cardProposalSchema = z.object({
  front: z.string().min(1).max(MAX_CARD_FRONT_CHARS),
  back: z.string().min(1).max(MAX_CARD_BACK_CHARS),
  example: z.string().min(1).max(MAX_CARD_EXAMPLE_CHARS).optional(),
  sources: z.array(httpUrlSchema).max(MAX_CARD_SOURCES),
  usedWebSearch: z.boolean(),
});

export type CardProposal = z.infer<typeof cardProposalSchema>;

export const draftKnowledgeBitChatInput = z.object({
  transcript: chatTranscriptSchema,
  mode: z.enum(["create", "edit"]),
  instruction: z.string().trim().max(MAX_DRAFT_INSTRUCTION_CHARS).optional(),
  previous: cardProposalSchema.optional(),
  allowWebSearch: z.boolean().optional().default(false),
});

export type DraftKnowledgeBitChatInput = z.input<typeof draftKnowledgeBitChatInput>;

export const draftKnowledgeBitChatResultSchema = z.object({
  sources: z.array(z.string()),
  card: cardProposalSchema,
});

export type DraftKnowledgeBitChatResult = z.infer<typeof draftKnowledgeBitChatResultSchema>;

export const editKnowledgeBitInput = z.object({
  body: z.string().trim().min(1).max(MAX_KNOWLEDGE_BIT_BODY_CHARS),
  background: z.string().trim().min(1).max(MAX_KNOWLEDGE_BIT_BODY_CHARS).nullable().optional(),
});

export type EditKnowledgeBitInput = z.input<typeof editKnowledgeBitInput>;
