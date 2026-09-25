import { z } from "zod";
import { chatMessageSchema } from "./study-chat";

export const askKnowledgeBitChatInput = z.object({
  message: z.string().min(1),
  transcript: z.array(chatMessageSchema).optional(),
});

export type AskKnowledgeBitChatInput = z.infer<typeof askKnowledgeBitChatInput>;

export const askKnowledgeBitChatResultSchema = z.object({
  reply: z.string(),
});

export type AskKnowledgeBitChatResult = z.infer<typeof askKnowledgeBitChatResultSchema>;
