import { z } from "zod";

// Bounds a single turn (user or replayed assistant reply) so pasted text
// can't blow up prompt size; generous enough for real chat use.
export const MAX_CHAT_MESSAGE_CHARS = 20_000;

// Prior turns sent to the model per chat request; older turns are dropped.
export const MAX_CHAT_TRANSCRIPT_MESSAGES = 12;

// Request-body bound, far above what a real session replays.
export const MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES = 200;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(MAX_CHAT_MESSAGE_CHARS),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatTranscriptSchema = z.array(chatMessageSchema).max(MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES);

export function takeRecentChatMessages(transcript: ChatMessage[] | undefined): ChatMessage[] {
  return (transcript ?? []).slice(-MAX_CHAT_TRANSCRIPT_MESSAGES);
}

export const askStudyChatInput = z.object({
  topicId: z.string(),
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  transcript: chatTranscriptSchema.optional(),
});

export type AskStudyChatInput = z.infer<typeof askStudyChatInput>;

export const askStudyChatResultSchema = z.object({
  reply: z.string(),
});

export type AskStudyChatResult = z.infer<typeof askStudyChatResultSchema>;
