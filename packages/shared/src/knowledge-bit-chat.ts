import { z } from "zod";
import { chatMessageSchema } from "./study-chat";

export const askKnowledgeBitChatInput = z.object({
  message: z.string().min(1),
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
  body: z.string().trim().min(1),
});

export type EditKnowledgeBitInput = z.input<typeof editKnowledgeBitInput>;
