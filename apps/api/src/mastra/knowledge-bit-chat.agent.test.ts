import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BIT_CHAT_INSTRUCTIONS } from "./knowledge-bit-chat.agent.js";

describe("KNOWLEDGE_BIT_CHAT_INSTRUCTIONS", () => {
  it("forbids answering from outside the knowledge item's own content", () => {
    expect(KNOWLEDGE_BIT_CHAT_INSTRUCTIONS).toContain("Never use your own general");
    expect(KNOWLEDGE_BIT_CHAT_INSTRUCTIONS).toContain(
      "use only the content of that knowledge item to answer",
    );
  });

  it("tells the agent to say plainly when the item doesn't cover the question", () => {
    expect(KNOWLEDGE_BIT_CHAT_INSTRUCTIONS).toContain(
      "this knowledge item doesn't cover it",
    );
  });
});
