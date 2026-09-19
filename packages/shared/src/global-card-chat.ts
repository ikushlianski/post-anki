import { z } from "zod";
import { chatMessageSchema } from "./study-chat";

export const askGlobalCardChatInput = z.object({
  message: z.string().min(1),
  transcript: z.array(chatMessageSchema).optional(),
});

export type AskGlobalCardChatInput = z.infer<typeof askGlobalCardChatInput>;

export const askGlobalCardChatResultSchema = z.object({
  reply: z.string(),
  matchedCardIds: z.array(z.string()),
});

export type AskGlobalCardChatResult = z.infer<typeof askGlobalCardChatResultSchema>;
