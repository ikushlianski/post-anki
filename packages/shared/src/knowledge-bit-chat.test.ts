import { describe, expect, it } from "vitest";
import { askKnowledgeBitChatInput } from "./knowledge-bit-chat.js";

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
});
