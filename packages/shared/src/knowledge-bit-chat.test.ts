import { describe, expect, it } from "vitest";
import {
  askKnowledgeBitChatInput,
  cardProposalSchema,
  draftKnowledgeBitChatInput,
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

describe("cardProposalSchema", () => {
  const valid = { front: "Q", back: "A", sources: [], usedWebSearch: false };

  it("should accept a card without an example", () => {
    expect(cardProposalSchema.safeParse(valid).success).toBe(true);
  });

  it("should reject a front over 300, a back over 600 and an example over 300 characters", () => {
    expect(cardProposalSchema.safeParse({ ...valid, front: "a".repeat(301) }).success).toBe(false);
    expect(cardProposalSchema.safeParse({ ...valid, back: "a".repeat(601) }).success).toBe(false);
    expect(cardProposalSchema.safeParse({ ...valid, example: "a".repeat(301) }).success).toBe(false);
  });

  it("should accept fields exactly at their caps", () => {
    const result = cardProposalSchema.safeParse({
      ...valid,
      front: "a".repeat(300),
      back: "a".repeat(600),
      example: "a".repeat(300),
    });

    expect(result.success).toBe(true);
  });

  it("should reject more than 5 sources and non-http sources", () => {
    const six = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`);

    expect(cardProposalSchema.safeParse({ ...valid, sources: six }).success).toBe(false);
    expect(cardProposalSchema.safeParse({ ...valid, sources: ["javascript:alert(1)"] }).success).toBe(false);
    expect(cardProposalSchema.safeParse({ ...valid, sources: ["ftp://example.com/a"] }).success).toBe(false);
  });
});

describe("draftKnowledgeBitChatInput", () => {
  it("should still accept an old request with no instruction or previous card", () => {
    const result = draftKnowledgeBitChatInput.safeParse({ transcript: [], mode: "create" });

    expect(result.success).toBe(true);
  });

  it("should accept an instruction and a previous card for a revision", () => {
    const result = draftKnowledgeBitChatInput.safeParse({
      transcript: [],
      mode: "create",
      instruction: "shorter answer",
      previous: { front: "Q", back: "A", sources: [], usedWebSearch: false },
    });

    expect(result.success).toBe(true);
  });

  it("should reject an instruction over the cap", () => {
    const result = draftKnowledgeBitChatInput.safeParse({
      transcript: [],
      mode: "create",
      instruction: "a".repeat(2_001),
    });

    expect(result.success).toBe(false);
  });
});
