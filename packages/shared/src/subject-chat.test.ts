import { describe, expect, it } from "vitest";
import { MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES } from "./study-chat.js";
import {
  askSubjectChatInput,
  MAX_SUBJECT_CHAT_CONTEXT_CHARS,
  MAX_SUBJECT_CHAT_MESSAGE_CHARS,
} from "./subject-chat.js";

const base = { subjectId: "s1", message: "What is a closure?" };

function transcript(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `turn-${i}`,
  }));
}

describe("askSubjectChatInput", () => {
  it("should accept a plain question about a subject", () => {
    expect(askSubjectChatInput.safeParse(base).success).toBe(true);
  });

  it("should reject a question without a subject", () => {
    expect(askSubjectChatInput.safeParse({ message: "hi" }).success).toBe(false);
  });

  it("should accept a message at the limit and reject one over it", () => {
    const at = "a".repeat(MAX_SUBJECT_CHAT_MESSAGE_CHARS);

    expect(askSubjectChatInput.safeParse({ ...base, message: at }).success).toBe(true);
    expect(askSubjectChatInput.safeParse({ ...base, message: `${at}a` }).success).toBe(false);
  });

  it("should reject an empty message", () => {
    expect(askSubjectChatInput.safeParse({ ...base, message: "" }).success).toBe(false);
  });

  it("should accept highlighted text at the limit and reject text over it", () => {
    const at = "a".repeat(MAX_SUBJECT_CHAT_CONTEXT_CHARS);

    expect(
      askSubjectChatInput.safeParse({ ...base, context: { kind: "selection", text: at } }).success,
    ).toBe(true);
    expect(
      askSubjectChatInput.safeParse({ ...base, context: { kind: "selection", text: `${at}a` } })
        .success,
    ).toBe(false);
  });

  it("should accept the current card as context and reject an unknown context kind", () => {
    expect(
      askSubjectChatInput.safeParse({
        ...base,
        context: { kind: "card", text: "Q: x A: y", cardId: "c1" },
      }).success,
    ).toBe(true);
    expect(
      askSubjectChatInput.safeParse({ ...base, context: { kind: "page", text: "x" } }).success,
    ).toBe(false);
  });

  it("should accept a long conversation and reject one over the request maximum", () => {
    const ok = askSubjectChatInput.safeParse({
      ...base,
      transcript: transcript(MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES),
    });
    const tooLong = askSubjectChatInput.safeParse({
      ...base,
      transcript: transcript(MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES + 1),
    });

    expect(ok.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });
});
