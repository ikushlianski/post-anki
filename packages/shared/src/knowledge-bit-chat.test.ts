import { describe, expect, it } from "vitest";
import {
  askKnowledgeBitChatInput,
  editKnowledgeBitInput,
  MAX_KNOWLEDGE_BIT_BODY_CHARS,
} from "./knowledge-bit-chat.js";
import { MAX_CHAT_MESSAGE_CHARS } from "./study-chat.js";

describe("askKnowledgeBitChatInput", () => {
  it("validates successfully when allowGeneralKnowledge and allowWebSearch are both omitted", () => {
    const data = askKnowledgeBitChatInput.parse({ message: "How does TCP connect?" });

    expect(data.allowGeneralKnowledge).toBe(false);
    expect(data.allowWebSearch).toBe(false);
  });

  it("validates successfully when both flags are explicitly set", () => {
    const data = askKnowledgeBitChatInput.parse({
      message: "How does TCP connect?",
      allowGeneralKnowledge: true,
      allowWebSearch: true,
    });

    expect(data.allowGeneralKnowledge).toBe(true);
    expect(data.allowWebSearch).toBe(true);
  });

  it("rejects a message longer than the chat message cap", () => {
    const result = askKnowledgeBitChatInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a message right at the chat message cap", () => {
    const result = askKnowledgeBitChatInput.safeParse({
      message: "a".repeat(MAX_CHAT_MESSAGE_CHARS),
    });

    expect(result.success).toBe(true);
  });

  it("rejects a transcript item longer than the chat message cap", () => {
    const result = askKnowledgeBitChatInput.safeParse({
      message: "How does TCP connect?",
      transcript: [{ role: "assistant", text: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1) }],
    });

    expect(result.success).toBe(false);
  });
});

describe("editKnowledgeBitInput", () => {
  it("rejects a body longer than the knowledge bit body cap", () => {
    const result = editKnowledgeBitInput.safeParse({
      body: "a".repeat(MAX_KNOWLEDGE_BIT_BODY_CHARS + 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a body right at the knowledge bit body cap", () => {
    const result = editKnowledgeBitInput.safeParse({
      body: "a".repeat(MAX_KNOWLEDGE_BIT_BODY_CHARS),
    });

    expect(result.success).toBe(true);
  });
});
