import type { Message } from "grammy/types";
import { messageText } from "../telegram/message-text.js";

export const START_REPLY =
  "I'm your architecture mentor. Send /today for today's question, /chat for Chat cards, /digest for weekly numbers, /rejected for rejected cards, then just reply with your answer and I'll probe deeper.";
export const DECLINE_REPLY = "I can only read text for now.";
export const ERROR_REPLY = "Had a hiccup — try again in a moment.";
export const UNKNOWN_COMMAND_REPLY = "Unknown command, see /help";
export const SKIP_ACK = "No problem — I'll skip this one.";
export const VOICE_TOO_LONG_REPLY =
  "That voice message is a bit long — try a shorter one, or just type it.";
export const TRANSCRIPTION_FAILED_REPLY =
  "I couldn't catch that — try again, or type your answer.";

export type ReplyDecision =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "today" }
  | { kind: "chat"; arg: string | null }
  | { kind: "digest" }
  | { kind: "rejected"; arg: string | null }
  | { kind: "inbox" }
  | { kind: "find"; arg: string | null }
  | { kind: "pause"; arg: string | null }
  | { kind: "resume" }
  | { kind: "streak" }
  | { kind: "study"; name: string | null }
  | { kind: "continue"; tool: string | null }
  | { kind: "done" }
  | { kind: "skip" }
  | { kind: "unknown_command" }
  | { kind: "process"; text: string }
  | { kind: "voice"; fileId: string; durationSec: number }
  | { kind: "decline" };

export const RECOGNIZED_COMMANDS = [
  "/start",
  "/help",
  "/today",
  "/push",
  "/chat",
  "/digest",
  "/rejected",
  "/inbox",
  "/find",
  "/pause",
  "/resume",
  "/streak",
  "/done",
  "/study",
] as const;

const SLASH_COMMAND_PATTERN = /^\/[a-z_]+(?:@\w+)?$/i;

const SKIP_PATTERN = /^skip[\s.!?]*$/i;

const TALK_ABOUT_PATTERN = /^let'?s\s+(?:talk about|discuss)\s+(.+?)[\s.!?]*$/i;

// A trailing tool name is only recognised when it reads like a short name
// (no comma, capped length) — a real answer that happens to start with
// "let's continue..." and then runs on into a full sentence (which will
// contain a comma or run past the cap) falls through to "process" instead
// of being misread as "start a fresh session on this text".
const TOOL_TAIL = "(?:\\s+(?:with|on|about)\\s+([^,]{1,40}?))?[\\s.!?]*$";
const CONTINUE_PATTERNS = [
  new RegExp(`^let'?s\\s+continue${TOOL_TAIL}`, "i"),
  new RegExp(`^where\\s+were\\s+we${TOOL_TAIL}`, "i"),
  new RegExp(`^continue${TOOL_TAIL}`, "i"),
];

export function classifyText(text: string): ReplyDecision {
  const firstWord = text.split(/\s+/, 1)[0] ?? "";
  const command = firstWord.split("@", 1)[0];

  if (command === "/start") return { kind: "start" };

  if (command === "/help") return { kind: "help" };

  if (command === "/today" || command === "/push") return { kind: "today" };

  if (command === "/chat") {
    const arg = text.slice(firstWord.length).trim();

    return { kind: "chat", arg: arg.length > 0 ? arg : null };
  }

  if (command === "/digest") return { kind: "digest" };

  if (command === "/rejected") {
    const arg = text.slice(firstWord.length).trim();

    return { kind: "rejected", arg: arg.length > 0 ? arg : null };
  }

  if (command === "/inbox") return { kind: "inbox" };

  if (command === "/find") {
    const arg = text.slice(firstWord.length).trim();

    return { kind: "find", arg: arg.length > 0 ? arg : null };
  }

  if (command === "/pause") {
    const arg = text.slice(firstWord.length).trim();

    return { kind: "pause", arg: arg.length > 0 ? arg : null };
  }

  if (command === "/resume") return { kind: "resume" };

  if (command === "/streak") return { kind: "streak" };

  if (command === "/done") return { kind: "done" };

  if (SKIP_PATTERN.test(text)) return { kind: "skip" };

  if (command === "/study") {
    const name = text.slice(firstWord.length).trim();

    return { kind: "study", name: name.length > 0 ? name : null };
  }

  if (SLASH_COMMAND_PATTERN.test(text)) {
    return { kind: "unknown_command" };
  }

  const talkAbout = text.match(TALK_ABOUT_PATTERN);

  if (talkAbout) {
    const name = talkAbout[1]!.trim();

    return { kind: "study", name: name.length > 0 ? name : null };
  }

  for (const pattern of CONTINUE_PATTERNS) {
    const match = text.match(pattern);

    if (match) {
      const tool = match[1]?.trim();

      return { kind: "continue", tool: tool && tool.length > 0 ? tool : null };
    }
  }

  return { kind: "process", text };
}

// Voice is a parallel input channel into classifyText, not a separate
// feature — a transcribed answer re-enters the exact same classification a
// typed one would, once webhook.handler.ts has a transcript in hand
// (.planning/22-voice-responses/spec.md Decision 3).
export function selectReply(message: Message): ReplyDecision {
  const text = messageText(message);

  if (text) return classifyText(text);

  if (message.voice) {
    return { kind: "voice", fileId: message.voice.file_id, durationSec: message.voice.duration };
  }

  return { kind: "decline" };
}

export function formatErrorReply(_error: unknown): string {
  return ERROR_REPLY;
}
