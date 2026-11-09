import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({ embedApprovedKnowledgeBits: vi.fn() }));
vi.mock("./knowledge-bit-chat-card.repo.js", () => ({}));
vi.mock("./knowledge-bit-web-tools.deps.js", () => ({
  createKnowledgeBitWebTools: vi.fn(() => ({ deps: { tag: "web-deps" }, getUsage: () => ({ searches: 0, fetches: 0 }) })),
}));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  loadChatCardContext: vi.fn(),
  moveKnowledgeBitToChatQueue: vi.fn(),
  snoozeChatQueueKnowledgeBit: vi.fn(),
}));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({
  deleteLastChatQueueExchange: vi.fn(),
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
}));
vi.mock("./knowledge-bit-chat-queue-search.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-stale.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-export.repo.js", () => ({ loadChatExportData: vi.fn() }));
vi.mock("./knowledge-bit-chat-thread-retention.js", () => ({ sweepDecidedChatThreadsHourly: vi.fn() }));

const { loadChatCardContext, moveKnowledgeBitToChatQueue, snoozeChatQueueKnowledgeBit } = await import(
  "./knowledge-bit-chat-queue.repo.js"
);
const { createKnowledgeBitWebTools } = await import("./knowledge-bit-web-tools.deps.js");
const { deleteLastChatQueueExchange, sendChatQueueMessage } = await import("./knowledge-bit-chat-queue.service.js");
const { loadChatExportData } = await import("./knowledge-bit-chat-queue-export.repo.js");
const {
  handleDeleteLastChatQueueExchange,
  handleExportChatQueueMarkdown,
  handleMoveKnowledgeBitToChatQueue,
  handleSendChatQueueMessage,
  handleSnoozeChatQueueKnowledgeBit,
  handleUnsnoozeChatQueueKnowledgeBit,
} = await import("./knowledge-bit-chat-queue.controller.js");

type FakeRes = http.ServerResponse & {
  status: number | null;
  headers: Record<string, string>;
  raw: string | undefined;
  body: unknown;
};

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): FakeRes {
  const res = {
    status: null as number | null,
    headers: {} as Record<string, string>,
    raw: undefined as string | undefined,
    get body() {
      return res.raw ? JSON.parse(res.raw) : undefined;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      res.status = status;
      res.headers = headers ?? {};
      return res;
    },
    end(payload?: string) {
      res.raw = payload;
    },
  };

  return res as unknown as FakeRes;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSnoozeChatQueueKnowledgeBit", () => {
  it("should refuse a snooze of 0, 31 or 1.5 days and leave the card untouched", async () => {
    for (const days of [0, 31, 1.5]) {
      const res = fakeRes();

      await handleSnoozeChatQueueKnowledgeBit(fakeReq({ days }), res, "kb_1");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "invalid_input" });
    }

    expect(snoozeChatQueueKnowledgeBit).not.toHaveBeenCalled();
  });

  it("should hide the card for the chosen whole days and report when it returns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.mocked(snoozeChatQueueKnowledgeBit).mockResolvedValue({ ok: true, value: "2026-01-04T00:00:00.000Z" });

    const res = fakeRes();

    await handleSnoozeChatQueueKnowledgeBit(fakeReq({ days: 3 }), res, "kb_1");

    vi.useRealTimers();

    expect(snoozeChatQueueKnowledgeBit).toHaveBeenCalledWith("kb_1", new Date("2026-01-04T00:00:00.000Z"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, snoozedUntil: "2026-01-04T00:00:00.000Z" });
  });

  it("should answer 404 for an unknown card and 409 for a card that is not in chat", async () => {
    vi.mocked(snoozeChatQueueKnowledgeBit).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    vi.mocked(snoozeChatQueueKnowledgeBit).mockResolvedValueOnce({ ok: false, reason: "blocked" });

    const missing = fakeRes();
    const blocked = fakeRes();

    await handleSnoozeChatQueueKnowledgeBit(fakeReq({ days: 1 }), missing, "kb_x");
    await handleSnoozeChatQueueKnowledgeBit(fakeReq({ days: 1 }), blocked, "kb_2");

    expect([missing.status, missing.body]).toEqual([404, { error: "not_found" }]);
    expect([blocked.status, blocked.body]).toEqual([409, { error: "blocked" }]);
  });
});

describe("handleUnsnoozeChatQueueKnowledgeBit", () => {
  it("should clear the snooze and report no return date", async () => {
    vi.mocked(snoozeChatQueueKnowledgeBit).mockResolvedValue({ ok: true, value: null });

    const res = fakeRes();

    await handleUnsnoozeChatQueueKnowledgeBit(res, "kb_1");

    expect(snoozeChatQueueKnowledgeBit).toHaveBeenCalledWith("kb_1", null);
    expect(res.body).toEqual({ ok: true, snoozedUntil: null });
  });

  it("should answer 409 when the card has left the chat list", async () => {
    vi.mocked(snoozeChatQueueKnowledgeBit).mockResolvedValue({ ok: false, reason: "blocked" });

    const res = fakeRes();

    await handleUnsnoozeChatQueueKnowledgeBit(res, "kb_1");

    expect(res.status).toBe(409);
  });
});

describe("handleMoveKnowledgeBitToChatQueue", () => {
  it("should move the card and return the new chat badge count", async () => {
    vi.mocked(moveKnowledgeBitToChatQueue).mockResolvedValue({ ok: true, value: 5 });

    const res = fakeRes();

    await handleMoveKnowledgeBitToChatQueue(res, "kb_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, chatCount: 5 });
  });

  it("should move an inbox card into chat the same way as a pending one", async () => {
    vi.mocked(moveKnowledgeBitToChatQueue).mockResolvedValue({ ok: true, value: 1 });

    const res = fakeRes();

    await handleMoveKnowledgeBitToChatQueue(res, "kb_inbox");

    expect(moveKnowledgeBitToChatQueue).toHaveBeenCalledWith("kb_inbox");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, chatCount: 1 });
  });

  it("should answer 404 for an unknown card and 409 for an already decided card", async () => {
    vi.mocked(moveKnowledgeBitToChatQueue).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    vi.mocked(moveKnowledgeBitToChatQueue).mockResolvedValueOnce({ ok: false, reason: "blocked" });

    const missing = fakeRes();
    const blocked = fakeRes();

    await handleMoveKnowledgeBitToChatQueue(missing, "kb_x");
    await handleMoveKnowledgeBitToChatQueue(blocked, "kb_2");

    expect(missing.status).toBe(404);
    expect(blocked.status).toBe(409);
  });
});

describe("handleSendChatQueueMessage", () => {
  it("should refuse a blank message or a missing message id before calling the model", async () => {
    for (const payload of [{ clientMessageId: "m1", message: "   " }, { message: "hi" }]) {
      const res = fakeRes();

      await handleSendChatQueueMessage(fakeReq(payload), res, "kb_1");

      expect(res.status).toBe(400);
    }

    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should return the assistant reply for a valid message", async () => {
    const value = { reply: "Because." } as never;

    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: true, value });

    const res = fakeRes();

    await handleSendChatQueueMessage(fakeReq({ clientMessageId: "m1", message: "why?" }), res, "kb_1");

    expect(sendChatQueueMessage).toHaveBeenCalledWith(
      "kb_1",
      { clientMessageId: "m1", message: "why?" },
      expect.objectContaining({ webTools: { tag: "web-deps" } }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Because." });
  });

  it("should give the learner chat two capped cheap searches and one page read, seeded with the card's source page", async () => {
    vi.mocked(loadChatCardContext).mockResolvedValue({ sourceUrl: "https://blog.example.com/post" } as never);
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: true, value: { reply: "x" } as never });

    await handleSendChatQueueMessage(fakeReq({ clientMessageId: "m1", message: "who wrote this?" }), fakeRes(), "kb_1");

    expect(createKnowledgeBitWebTools).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBitId: "kb_1",
        maxSearches: 2,
        maxPageFetches: 1,
        maxPageChars: 6000,
        forceTier: "cheap",
        seedCitedUrls: ["https://blog.example.com/post"],
      }),
    );
  });

  it("should seed nothing when the card has no source page", async () => {
    vi.mocked(loadChatCardContext).mockResolvedValue({ sourceUrl: null } as never);
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: true, value: { reply: "x" } as never });

    await handleSendChatQueueMessage(fakeReq({ clientMessageId: "m1", message: "why?" }), fakeRes(), "kb_1");

    expect(createKnowledgeBitWebTools).toHaveBeenCalledWith(expect.objectContaining({ seedCitedUrls: [] }));
  });

  it.each([
    ["not_found", 404],
    ["not_in_chat", 409],
    ["in_flight", 409],
    ["cap_reached", 429],
    ["budget_paused", 423],
    ["model_failed", 502],
  ] as const)("should map the %s failure to HTTP %i", async (error, status) => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleSendChatQueueMessage(fakeReq({ clientMessageId: "m1", message: "why?" }), res, "kb_1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });
});

describe("handleDeleteLastChatQueueExchange", () => {
  it("should confirm the removal and pass along what the service returns", async () => {
    vi.mocked(deleteLastChatQueueExchange).mockResolvedValue({ ok: true, value: { turnsLeft: 6 } } as never);

    const res = fakeRes();

    await handleDeleteLastChatQueueExchange(res, "kb_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, turnsLeft: 6 });
  });

  it.each([
    ["no_messages", 404],
    ["not_in_chat", 409],
    ["in_flight", 409],
  ] as const)("should map the %s failure to HTTP %i", async (error, status) => {
    vi.mocked(deleteLastChatQueueExchange).mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleDeleteLastChatQueueExchange(res, "kb_1");

    expect(res.status).toBe(status);
  });
});

describe("handleExportChatQueueMarkdown", () => {
  it("should require a subject before loading anything", async () => {
    const res = fakeRes();

    await handleExportChatQueueMarkdown(res, null);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "subject_required" });
    expect(loadChatExportData).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown subject", async () => {
    vi.mocked(loadChatExportData).mockResolvedValue(null);

    const res = fakeRes();

    await handleExportChatQueueMarkdown(res, "subj_x");

    expect(res.status).toBe(404);
  });

  it("should download a markdown file named after the subject with its chat cards", async () => {
    vi.mocked(loadChatExportData).mockResolvedValue({
      subjectName: "Rust Basics",
      cards: [{ body: "Ownership moves values", background: null, messages: [{ role: "user", text: "why?" }] }],
    });

    const res = fakeRes();

    await handleExportChatQueueMarkdown(res, "subj_1");

    expect(loadChatExportData).toHaveBeenCalledWith("subj_1", 200);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(res.headers["content-disposition"]).toContain("attachment; filename=\"chat-");
    expect(res.raw).toContain("Ownership moves values");
  });
});
