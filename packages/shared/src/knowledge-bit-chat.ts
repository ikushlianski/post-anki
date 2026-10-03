import { z } from "zod";
import { chatMessageSchema, MAX_CHAT_MESSAGE_CHARS } from "./study-chat";

// Durable content like detect-knowledge-bits.orchestrator.ts's MAX_SOURCE_CHARS, not a chat turn.
export const MAX_KNOWLEDGE_BIT_BODY_CHARS = 50_000;

export const askKnowledgeBitChatInput = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  transcript: z.array(chatMessageSchema).optional(),
  allowGeneralKnowledge: z.boolean().optional().default(false),
  allowWebSearch: z.boolean().optional().default(false),
});

export type AskKnowledgeBitChatInput = z.input<typeof askKnowledgeBitChatInput>;

export const askKnowledgeBitChatResultSchema = z.object({
  reply: z.string(),
});

export type AskKnowledgeBitChatResult = z.infer<typeof askKnowledgeBitChatResultSchema>;

export const draftKnowledgeBitChatInput = z.object({
  transcript: z.array(chatMessageSchema),
  mode: z.enum(["create", "edit"]),
});

export type DraftKnowledgeBitChatInput = z.input<typeof draftKnowledgeBitChatInput>;

export const draftKnowledgeBitChatResultSchema = z.object({
  proposedBody: z.string(),
});

export type DraftKnowledgeBitChatResult = z.infer<typeof draftKnowledgeBitChatResultSchema>;

export const editKnowledgeBitInput = z.object({
  body: z.string().trim().min(1).max(MAX_KNOWLEDGE_BIT_BODY_CHARS),
  background: z.string().trim().min(1).max(MAX_KNOWLEDGE_BIT_BODY_CHARS).nullable().optional(),
});

export type EditKnowledgeBitInput = z.input<typeof editKnowledgeBitInput>;
