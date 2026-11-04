import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-chat-card.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  countChatQueueKnowledgeBits: vi.fn(),
  countAllChatQueueKnowledgeBits: vi.fn(),
  listChatQueueKnowledgeBits: vi.fn(),
}));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-search.repo.js", () => ({ searchChatQueueMessages: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-thread-retention.js", () => ({ sweepDecidedChatThreadsHourly: vi.fn() }));

const { countAllChatQueueKnowledgeBits, countChatQueueKnowledgeBits, listChatQueueKnowledgeBits } = await import("./knowledge-bit-chat-queue.repo.js");
const { searchChatQueueMessages } = await import("./knowledge-bit-chat-queue-search.repo.js");
const { handleCountChatQueueKnowledgeBits, handleListChatQueueKnowledgeBits, handleSearchChatQueueMessages } = await import(
  "./knowledge-bit-chat-queue.controller.js"
);

function fakeRes() {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

describe("handleCountChatQueueKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return only the number of unsnoozed chat cards for the sidebar badge", async () => {
    vi.mocked(countChatQueueKnowledgeBits).mockResolvedValue(4);

    const res = fakeRes();

    await handleCountChatQueueKnowledgeBits(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 4 });
  });
});

describe("handleListChatQueueKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should flag a truncated list and report the total including snoozed cards", async () => {
    vi.mocked(listChatQueueKnowledgeBits).mockResolvedValue([]);
    vi.mocked(countChatQueueKnowledgeBits).mockResolvedValue(0);
    vi.mocked(countAllChatQueueKnowledgeBits).mockResolvedValue(3);

    const res = fakeRes();

    await handleListChatQueueKnowledgeBits(res);

    expect(res.body).toEqual({ items: [], count: 0, total: 3, hasMore: true });
  });

  it("should not flag a list that holds every card", async () => {
    vi.mocked(listChatQueueKnowledgeBits).mockResolvedValue([]);
    vi.mocked(countChatQueueKnowledgeBits).mockResolvedValue(0);
    vi.mocked(countAllChatQueueKnowledgeBits).mockResolvedValue(0);

    const res = fakeRes();

    await handleListChatQueueKnowledgeBits(res);

    expect(res.body).toEqual({ items: [], count: 0, total: 0, hasMore: false });
  });
});

describe("handleSearchChatQueueMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should refuse a missing or one-character query without touching the database", async () => {
    for (const q of [null, "a", "  "]) {
      const res = fakeRes();

      await handleSearchChatQueueMessages(res, q);

      expect(res.status).toBe(400);
    }

    expect(searchChatQueueMessages).not.toHaveBeenCalled();
  });

  it("should search with the trimmed query and return the results", async () => {
    const hit = { cardId: "kb_1", seq: 2, role: "assistant" as const, snippet: "because" };

    vi.mocked(searchChatQueueMessages).mockResolvedValue({ results: [hit], hasMore: true });

    const res = fakeRes();

    await handleSearchChatQueueMessages(res, " because ");

    expect(searchChatQueueMessages).toHaveBeenCalledWith("because");
    expect(res.body).toEqual({ results: [hit], hasMore: true });
  });
});
