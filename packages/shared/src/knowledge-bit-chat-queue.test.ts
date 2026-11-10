import { describe, expect, it } from "vitest";
import {
  CHAT_QUEUE_MAX_MESSAGE_CHARS,
  CHAT_QUEUE_REPLY_MAX_TOKENS,
  CHAT_QUEUE_MAX_PROPOSALS,
  chatQueueCountSchema,
  chatQueueErrorCodeSchema,
  chatQueueMessageSchema,
  chatQueueProposalSchema,
  sendChatQueueMessageResultSchema,
  chatQueueSearchQuerySchema,
  moveToChatQueueInput,
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
  const proposal = { index: 0, kind: "create", front: "F", back: "B", status: "pending" };
  const base = { reply: "Hi", replySeq: 2, turnsLeft: 3, capReached: false };

  it("should accept a reply with no, one or two proposed cards", () => {
    expect(sendChatQueueMessageResultSchema.safeParse(base).success).toBe(true);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...base, proposals: [proposal] }).success).toBe(true);
    expect(
      sendChatQueueMessageResultSchema.safeParse({ ...base, proposals: [proposal, { ...proposal, index: 1 }] }).success,
    ).toBe(true);
  });

  it("should refuse three proposed cards and a proposal with an empty front", () => {
    expect(
      sendChatQueueMessageResultSchema.safeParse({ ...base, proposals: [proposal, proposal, proposal] }).success,
    ).toBe(false);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...base, proposals: [{ ...proposal, front: "" }] }).success).toBe(
      false,
    );
  });

  it("should leave room in the reply budget for the card block", () => {
    expect(CHAT_QUEUE_REPLY_MAX_TOKENS).toBe(900);
  });
});

describe("chatQueueProposalSchema", () => {
  const base = { index: 0, kind: "create", front: "F", back: "B", status: "pending" };

  it("should accept a minimal pending proposal and one with example, reason and saved id", () => {
    expect(chatQueueProposalSchema.safeParse(base).success).toBe(true);
    expect(
      chatQueueProposalSchema.safeParse({ ...base, example: "E", reason: "clearer", status: "accepted", savedCardId: "kb1" })
        .success,
    ).toBe(true);
  });

  it("should refuse fields longer than the manual card limits and a reason over 200 characters", () => {
    expect(chatQueueProposalSchema.safeParse({ ...base, front: "x".repeat(301) }).success).toBe(false);
    expect(chatQueueProposalSchema.safeParse({ ...base, back: "x".repeat(601) }).success).toBe(false);
    expect(chatQueueProposalSchema.safeParse({ ...base, example: "x".repeat(301) }).success).toBe(false);
    expect(chatQueueProposalSchema.safeParse({ ...base, reason: "x".repeat(201) }).success).toBe(false);
  });

  it("should refuse an unknown kind or status and an index beyond the per-reply limit", () => {
    expect(chatQueueProposalSchema.safeParse({ ...base, kind: "delete" }).success).toBe(false);
    expect(chatQueueProposalSchema.safeParse({ ...base, status: "saved" }).success).toBe(false);
    expect(chatQueueProposalSchema.safeParse({ ...base, index: CHAT_QUEUE_MAX_PROPOSALS }).success).toBe(false);
  });

  it("should cap a message at two proposals and include the new error code", () => {
    const message = { seq: 2, role: "assistant", text: "t", createdAt: "c" };
    const three = [0, 1, 1].map((index) => ({ ...base, index }));

    expect(chatQueueMessageSchema.safeParse({ ...message, proposals: three }).success).toBe(false);
    expect(chatQueueMessageSchema.safeParse({ ...message, proposals: three.slice(0, 2) }).success).toBe(true);
    expect(chatQueueErrorCodeSchema.safeParse("proposal_not_pending").success).toBe(true);
  });

  it("should require the reply sequence number in a send result", () => {
    const result = { reply: "r", turnsLeft: 3, capReached: false };

    expect(sendChatQueueMessageResultSchema.safeParse(result).success).toBe(false);
    expect(sendChatQueueMessageResultSchema.safeParse({ ...result, replySeq: 4, proposals: [base] }).success).toBe(true);
  });
});

describe("moveToChatQueueInput", () => {
  it("should accept a plain send with no first prompt", () => {
    expect(moveToChatQueueInput.safeParse({}).success).toBe(true);
  });

  it("should trim the first prompt before it is stored", () => {
    expect(moveToChatQueueInput.parse({ prompt: "  why this?  " }).prompt).toBe("why this?");
  });

  it("should refuse a first prompt over the character cap so one send cannot inflate cost", () => {
    const parsed = moveToChatQueueInput.safeParse({ prompt: "a".repeat(CHAT_QUEUE_MAX_MESSAGE_CHARS + 1) });

    expect(parsed.success).toBe(false);
  });
});
