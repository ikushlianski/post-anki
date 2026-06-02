import type { Update } from "grammy/types";

export function isAuthorizedChat(update: Update, ownerChatId: number): boolean {
  const chatId =
    update.message?.chat?.id ??
    update.edited_message?.chat?.id ??
    update.callback_query?.message?.chat?.id;
  return typeof chatId === "number" && chatId === ownerChatId;
}
