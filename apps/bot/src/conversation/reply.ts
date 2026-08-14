import type { Message } from "grammy/types";

export const START_REPLY =
  "I'm your architecture mentor. Send /today for today's question, then just reply with your answer and I'll probe deeper.";
export const DECLINE_REPLY = "I can only read text for now.";
export const ERROR_REPLY = "Had a hiccup — try again in a moment.";
export const SKIP_ACK = "No problem — I'll skip this one.";

export type ReplyDecision =
  | { kind: "start" }
  | { kind: "today" }
  | { kind: "study"; name: string | null }
  | { kind: "continue"; tool: string | null }
  | { kind: "done" }
  | { kind: "skip" }
  | { kind: "process"; text: string }
  | { kind: "decline" };

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

export function selectReply(message: Message): ReplyDecision {
  const text = message.text?.trim();

  if (!text) return { kind: "decline" };

  const firstWord = text.split(/\s+/, 1)[0] ?? "";
  const command = firstWord.split("@", 1)[0];

  if (command === "/start") return { kind: "start" };

  if (command === "/today" || command === "/push") return { kind: "today" };

  if (command === "/done") return { kind: "done" };

  if (SKIP_PATTERN.test(text)) return { kind: "skip" };

  if (command === "/study") {
    const name = text.slice(firstWord.length).trim();

    return { kind: "study", name: name.length > 0 ? name : null };
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

export function formatErrorReply(_error: unknown): string {
  return ERROR_REPLY;
}
