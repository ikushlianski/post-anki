import { z } from "zod";
import { chatMessageSchema, MAX_CHAT_MESSAGE_CHARS } from "./study-chat";

export const subtopicSuggestionSchema = z.object({
  title: z.string().min(1),
  rationale: z.string(),
});

export type SubtopicSuggestion = z.infer<typeof subtopicSuggestionSchema>;

export const askQaChatInput = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  topicId: z.string().optional(),
  curriculumId: z.string().optional(),
  transcript: z.array(chatMessageSchema).optional(),
});

export type AskQaChatInput = z.infer<typeof askQaChatInput>;

export const askQaChatResultSchema = z.object({
  reply: z.string(),
  suggestedSubtopics: z.array(subtopicSuggestionSchema).optional(),
  citations: z.array(z.string()).optional(),
});

export type AskQaChatResult = z.infer<typeof askQaChatResultSchema>;
