import { z } from "zod";

// Bounds a single turn (user or replayed assistant reply) so pasted text
// can't blow up prompt size; generous enough for real chat use.
export const MAX_CHAT_MESSAGE_CHARS = 20_000;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(MAX_CHAT_MESSAGE_CHARS),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const askStudyChatInput = z.object({
  topicId: z.string(),
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  transcript: z.array(chatMessageSchema).optional(),
});

export type AskStudyChatInput = z.infer<typeof askStudyChatInput>;

export const askStudyChatResultSchema = z.object({
  reply: z.string(),
});

export type AskStudyChatResult = z.infer<typeof askStudyChatResultSchema>;
