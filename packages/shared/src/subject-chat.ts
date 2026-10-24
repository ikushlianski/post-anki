import { z } from "zod";
import { chatTranscriptSchema } from "./study-chat";

export const MAX_SUBJECT_CHAT_MESSAGE_CHARS = 2_000;
export const MAX_SUBJECT_CHAT_CONTEXT_CHARS = 1_500;

export const subjectChatContextSchema = z.object({
  kind: z.enum(["selection", "card"]),
  text: z.string().min(1).max(MAX_SUBJECT_CHAT_CONTEXT_CHARS),
  cardId: z.string().optional(),
});

export type SubjectChatContext = z.infer<typeof subjectChatContextSchema>;

export const askSubjectChatInput = z.object({
  subjectId: z.string().min(1),
  message: z.string().min(1).max(MAX_SUBJECT_CHAT_MESSAGE_CHARS),
  transcript: chatTranscriptSchema.optional(),
  context: subjectChatContextSchema.optional(),
});

export type AskSubjectChatInput = z.infer<typeof askSubjectChatInput>;

export const subjectChatUsedBitSchema = z.object({
  id: z.string(),
  preview: z.string(),
});

export type SubjectChatUsedBit = z.infer<typeof subjectChatUsedBitSchema>;

export const askSubjectChatResultSchema = z.object({
  reply: z.string(),
  usedBits: z.array(subjectChatUsedBitSchema),
  lookupFailed: z.boolean(),
  noMatch: z.boolean(),
});

export type AskSubjectChatResult = z.infer<typeof askSubjectChatResultSchema>;
