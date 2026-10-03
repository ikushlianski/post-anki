import { describe, expect, it } from "vitest";
import { submitStructureTurnInput } from "./curriculum.js";
import { MAX_CHAT_MESSAGE_CHARS } from "./study-chat.js";

describe("submitStructureTurnInput", () => {
  it("rejects a message longer than the chat message cap", () => {
    const result = submitStructureTurnInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a message right at the chat message cap", () => {
    const result = submitStructureTurnInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS),
    });

    expect(result.success).toBe(true);
  });
});
