import { describe, expect, it } from "vitest";
import { purposeForAgent } from "./agent-purpose.js";

describe("purposeForAgent", () => {
  it("should tag every chat agent as chat", () => {
    for (const key of ["studyChat", "qaChat", "globalCardChat", "subjectChat", "knowledgeBitChat", "knowledgeBitChatDraft", "knowledgeBitChatQueue", "languageChat"]) {
      expect(purposeForAgent(key)).toBe("chat");
    }
  });

  it("should tag card creation, dedup and subject assignment as cards", () => {
    expect(purposeForAgent("knowledgeBitBasicCardGenerator")).toBe("cards");
    expect(purposeForAgent("cardDedupEscalation")).toBe("cards");
    expect(purposeForAgent("subjectAssignmentEscalation")).toBe("cards");
    expect(purposeForAgent("subjectCreation")).toBe("cards");
  });

  it("should tag unmapped agents as other", () => {
    expect(purposeForAgent("mentorEval")).toBe("other");
    expect(purposeForAgent("unknown-agent")).toBe("other");
  });
});
