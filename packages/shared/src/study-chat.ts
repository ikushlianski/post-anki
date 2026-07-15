import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const askStudyChatInput = z.object({
  topicId: z.string(),
  message: z.string().min(1),
  transcript: z.array(chatMessageSchema).optional(),
});

export type AskStudyChatInput = z.infer<typeof askStudyChatInput>;

export const askStudyChatResultSchema = z.object({
  reply: z.string(),
});

export type AskStudyChatResult = z.infer<typeof askStudyChatResultSchema>;
