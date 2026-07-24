import { z } from "zod";

export const languageChatReplySchema = z.object({
  languagePracticeReply: z.string(),
});

export type LanguageChatReply = z.infer<typeof languageChatReplySchema>;
