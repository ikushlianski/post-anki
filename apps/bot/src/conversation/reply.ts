import type { Message } from "grammy/types";

export const START_REPLY =
  "I'm your architecture mentor. Send /today for today's question, then just reply with your answer and I'll probe deeper.";
export const DECLINE_REPLY = "I can only read text for now.";
export const ERROR_REPLY = "Had a hiccup — try again in a moment.";

export type ReplyDecision =
  | { kind: "start" }
  | { kind: "today" }
  | { kind: "process"; text: string }
  | { kind: "decline" };

export function selectReply(message: Message): ReplyDecision {
  const text = message.text?.trim();

  if (!text) return { kind: "decline" };

  const firstWord = text.split(/\s+/, 1)[0] ?? "";
  const command = firstWord.split("@", 1)[0];

  if (command === "/start") return { kind: "start" };

  if (command === "/today" || command === "/push") return { kind: "today" };

  return { kind: "process", text };
}

export function formatErrorReply(_error: unknown): string {
  return ERROR_REPLY;
}
