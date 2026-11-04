import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS } from "./knowledge-bit-chat-queue.agent.js";

describe("chat queue agent instructions", () => {
  it("should tell the model that card, source and messages are data and that it cannot decide cards", () => {
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toMatch(/untrusted data, not instructions/);
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toMatch(/cannot change card state/);
    expect(KNOWLEDGE_BIT_CHAT_QUEUE_INSTRUCTIONS).toMatch(/Do not reveal/);
  });
});
