import { describe, expect, it } from "vitest";
import { askGlobalCardChatInput } from "./global-card-chat.js";
import {
  askKnowledgeBitChatInput,
  draftKnowledgeBitChatInput,
  MAX_DRAFT_TRANSCRIPT_MESSAGES,
} from "./knowledge-bit-chat.js";
import { askQaChatInput } from "./qa-chat.js";
import {
  askStudyChatInput,
  MAX_CHAT_TRANSCRIPT_MESSAGES,
  MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES,
  takeRecentChatMessages,
} from "./study-chat.js";

function transcript(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `turn-${i}`,
  }));
}

const requests = [
  ["study chat", (n: number) => askStudyChatInput.safeParse({ topicId: "t1", message: "hi", transcript: transcript(n) })],
  ["Q&A chat", (n: number) => askQaChatInput.safeParse({ message: "hi", transcript: transcript(n) })],
  ["card chat", (n: number) => askKnowledgeBitChatInput.safeParse({ message: "hi", transcript: transcript(n) })],
  ["global card chat", (n: number) => askGlobalCardChatInput.safeParse({ message: "hi", transcript: transcript(n) })],
  ["draft chat", (n: number) => draftKnowledgeBitChatInput.safeParse({ mode: "create", transcript: transcript(n) })],
] as const;

describe.each(requests)("%s transcript bound", (_name, parse) => {
  it("should accept a long but realistic conversation", () => {
    expect(parse(MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES).success).toBe(true);
  });

  it("should reject a transcript over the request maximum", () => {
    expect(parse(MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES + 1).success).toBe(false);
  });
});

describe("takeRecentChatMessages", () => {
  it("should keep only the newest messages when the conversation is longer than the limit", () => {
    const recent = takeRecentChatMessages(transcript(MAX_CHAT_TRANSCRIPT_MESSAGES + 5));

    expect(recent).toHaveLength(MAX_CHAT_TRANSCRIPT_MESSAGES);
    expect(recent[0]!.text).toBe("turn-5");
  });

  it("should return an empty list when there is no transcript", () => {
    expect(takeRecentChatMessages(undefined)).toEqual([]);
  });

  it("should keep the draft limit equal to the shared chat limit", () => {
    expect(MAX_DRAFT_TRANSCRIPT_MESSAGES).toBe(MAX_CHAT_TRANSCRIPT_MESSAGES);
  });
});
