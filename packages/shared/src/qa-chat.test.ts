import { describe, expect, it } from "vitest";
import { askQaChatInput } from "./qa-chat.js";
import { MAX_CHAT_MESSAGE_CHARS } from "./study-chat.js";

describe("askQaChatInput", () => {
  it("rejects a message longer than the chat message cap", () => {
    const result = askQaChatInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a message right at the chat message cap", () => {
    const result = askQaChatInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS),
    });

    expect(result.success).toBe(true);
  });
});
