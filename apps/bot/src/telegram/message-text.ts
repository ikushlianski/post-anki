import type { Message } from "grammy/types";

export function messageText(message: Message): string {
  if (message.text !== undefined) return message.text.trim();

  if (message.voice) return "";

  return message.caption?.trim() ?? "";
}
