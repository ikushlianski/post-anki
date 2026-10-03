import { z } from "zod";
import { chatMessageSchema, MAX_CHAT_MESSAGE_CHARS } from "./study-chat";

export const askGlobalCardChatInput = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  transcript: z.array(chatMessageSchema).optional(),
  allowGeneralKnowledge: z.boolean().optional(),
});

export type AskGlobalCardChatInput = z.infer<typeof askGlobalCardChatInput>;

export const globalCardChatMatchedCardSchema = z.object({
  variantId: z.string(),
  prompt: z.string(),
  topicTitle: z.string(),
});

export type GlobalCardChatMatchedCard = z.infer<typeof globalCardChatMatchedCardSchema>;

export const askGlobalCardChatResultSchema = z.object({
  reply: z.string(),
  matchedCards: z.array(globalCardChatMatchedCardSchema),
});

export type AskGlobalCardChatResult = z.infer<typeof askGlobalCardChatResultSchema>;
