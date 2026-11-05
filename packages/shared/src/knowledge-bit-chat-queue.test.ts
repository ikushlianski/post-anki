import { describe, expect, it } from "vitest";
import {
  CHAT_QUEUE_MAX_MESSAGE_CHARS,
  CHAT_QUEUE_REPLY_MAX_TOKENS,
  chatQueueCountSchema,
  createCardFromChatMessageInput,
  sendChatQueueMessageResultSchema,
  chatQueueSearchQuerySchema,
  chatQueueSearchResponseSchema,
  sendChatQueueMessageInput,
  snoozeChatQueueInput,
} from "./knowledge-bit-chat-queue";

describe("sendChatQueueMessageInput", () => {
  it("should accept a message at the character cap", () => {
    const parsed = sendChatQueueMessageInput.safeParse({
      clientMessageId: "m1",
      message: "a".repeat(CHAT_QUEUE_MAX_MESSAGE_CHARS),
    });

    expect(parsed.success).toBe(true);
  });

  it("should refuse a message over the cap so a tampered client cannot inflate cost", () => {
    const parsed = sendChatQueueMessageInput.safeParse({
      clientMessageId: "m1",
      message: "a".repeat(CHAT_QUEUE_MAX_MESSAGE_CHARS + 1),
    });

    expect(parsed.success).toBe(false);
  });

  it("should refuse a blank message", () => {
    expect(sendChatQueueMessageInput.safeParse({ clientMessageId: "m1", message: "   " }).success).toBe(false);
  });
});

describe("snoozeChatQueueInput", () => {
  it("should accept whole days from 1 to 30", () => {
    expect(snoozeChatQueueInput.safeParse({ days: 1 }).success).toBe(true);
    expect(snoozeChatQueueInput.safeParse({ days: 30 }).success).toBe(true);
  });

  it("should refuse zero, over 30, or fractional days", () => {
    expect(snoozeChatQueueInput.safeParse({ days: 0 }).success).toBe(false);
    expect(snoozeChatQueueInput.safeParse({ days: 31 }).success).toBe(false);
    expect(snoozeChatQueueInput.safeParse({ days: 1.5 }).success).toBe(false);
  });
});

describe("chatQueueCountSchema", () => {
  it("should accept a non-negative whole badge count and refuse a negative one", () => {
    expect(chatQueueCountSchema.safeParse({ count: 0 }).success).toBe(true);
    expect(chatQueueCountSchema.safeParse({ count: -1 }).success).toBe(false);
  });
});

describe("chatQueueSearchQuerySchema", () => {
  it("should trim the query and accept two or more characters", () => {
    expect(chatQueueSearchQuerySchema.parse({ q: "  ab " }).q).toBe("ab");
  });

  it("should refuse a one-character or blank query so a keystroke never scans every thread", () => {
    expect(chatQueueSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(chatQueueSearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
    expect(chatQueueSearchQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("chatQueueSearchResponseSchema", () => {
  it("should accept at most 20 results", () => {
    const hit = { cardId: "kb_1", seq: 1, role: "user", snippet: "x" };

    expect(chatQueueSearchResponseSchema.safeParse({ results: Array(20).fill(hit) }).success).toBe(true);
    expect(chatQueueSearchResponseSchema.safeParse({ results: Array(21).fill(hit) }).success).toBe(false);
  });

  it("should accept an old response without the cut flag and a new one with it", () => {
    expect(chatQueueSearchResponseSchema.safeParse({ results: [] }).success).toBe(true);
    expect(chatQueueSearchResponseSchema.safeParse({ results: [], hasMore: true }).success).toBe(true);
    expect(chatQueueSearchResponseSchema.safeParse({ results: [], hasMore: "yes" }).success).toBe(false);
  });
});

describe("sendChatQueueMessageResultSchema", () => {
  const suggestion = { front: "F", back: "B", origin: "own", sources: [] };
  const base = { reply: "Hi", turnsLeft: 3, capReached: false };

  it("should accept a reply with no, one or two proposed cards", () => {
    expect(sendChatQueueMessageResultSchema.safeParse(base).success).toBe(true);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...base, suggestions: [suggestion] }).success).toBe(true);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...base, suggestions: [suggestion, suggestion] }).success).toBe(true);
  });

  it("should refuse three proposed cards and a proposal with an empty front", () => {
    expect(
      sendChatQueueMessageResultSchema.safeParse({ ...base, suggestions: [suggestion, suggestion, suggestion] }).success,
    ).toBe(false);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...base, suggestions: [{ ...suggestion, front: "" }] }).success).toBe(
      false,
    );
  });

  it("should leave room in the reply budget for the card block", () => {
    expect(CHAT_QUEUE_REPLY_MAX_TOKENS).toBe(700);
  });
});

describe("createCardFromChatMessageInput", () => {
  it("should accept an approving card with an example and a plain pending card", () => {
    expect(createCardFromChatMessageInput.safeParse({ front: "F", back: "B", example: "E", approve: true }).success).toBe(true);
    expect(createCardFromChatMessageInput.safeParse({ front: "F", back: "B" }).success).toBe(true);
  });

  it("should refuse an approve flag that is not a boolean and a blank front", () => {
    expect(createCardFromChatMessageInput.safeParse({ front: "F", back: "B", approve: "yes" }).success).toBe(false);
    expect(createCardFromChatMessageInput.safeParse({ front: "  ", back: "B" }).success).toBe(false);
  });
});
