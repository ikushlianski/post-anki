import { describe, expect, it } from "vitest";
import { askStudyChatInput, chatMessageSchema, MAX_CHAT_MESSAGE_CHARS } from "./study-chat.js";

describe("chatMessageSchema", () => {
  it("rejects a transcript turn longer than the chat message cap", () => {
    const result = chatMessageSchema.safeParse({
      role: "assistant",
      text: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a transcript turn right at the chat message cap", () => {
    const result = chatMessageSchema.safeParse({
      role: "assistant",
      text: "a".repeat(MAX_CHAT_MESSAGE_CHARS),
    });

    expect(result.success).toBe(true);
  });
});

describe("askStudyChatInput", () => {
  it("rejects a message longer than the chat message cap", () => {
    const result = askStudyChatInput.safeParse({
      topicId: "topic-1",
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a message right at the chat message cap", () => {
    const result = askStudyChatInput.safeParse({
      topicId: "topic-1",
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS),
    });

    expect(result.success).toBe(true);
  });
});
