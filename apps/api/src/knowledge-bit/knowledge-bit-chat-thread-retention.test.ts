import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteChatThreadsOfDecidedCards = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({ deleteChatThreadsOfDecidedCards }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn() } }));

const { sweepDecidedChatThreadsHourly } = await import("./knowledge-bit-chat-thread-retention.js");

describe("sweepDecidedChatThreadsHourly", () => {
  beforeEach(() => {
    deleteChatThreadsOfDecidedCards.mockClear();
  });

  it("should run the retention sweep at most once per hour however often the queue is polled", () => {
    sweepDecidedChatThreadsHourly();
    sweepDecidedChatThreadsHourly();
    sweepDecidedChatThreadsHourly();

    expect(deleteChatThreadsOfDecidedCards).toHaveBeenCalledTimes(1);
  });
});
