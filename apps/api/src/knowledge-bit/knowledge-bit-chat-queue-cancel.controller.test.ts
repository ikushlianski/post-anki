import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../background-job/background-job.starter.js", () => ({ dispatchBackgroundJob: vi.fn() }));
vi.mock("./chat-first-reply.orchestrator.js", () => ({ answerFirstChatPrompt: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue-web-tools.js", () => ({ createChatQueueWebTools: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({ cancelChatQueueKnowledgeBit: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-search.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-stale.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-export.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-thread-retention.js", () => ({}));

const { cancelChatQueueKnowledgeBit } = await import("./knowledge-bit-chat-queue.repo.js");
const { handleCancelChatQueueThread } = await import("./knowledge-bit-chat-queue.controller.js");

function fakeRes() {
  const res = {
    status: null as number | null,
    raw: undefined as string | undefined,
    get body() {
      return res.raw ? JSON.parse(res.raw) : undefined;
    },
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.raw = payload;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCancelChatQueueThread", () => {
  it("should confirm when the chat is cancelled and the card is back in triage", async () => {
    vi.mocked(cancelChatQueueKnowledgeBit).mockResolvedValue({ ok: true, value: undefined });

    const res = fakeRes();

    await handleCancelChatQueueThread(res, "kb_1");

    expect(cancelChatQueueKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
  });

  it("should answer 404 for an unknown card and 409 for a card that is already decided", async () => {
    vi.mocked(cancelChatQueueKnowledgeBit).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    vi.mocked(cancelChatQueueKnowledgeBit).mockResolvedValueOnce({ ok: false, reason: "blocked" });

    const missing = fakeRes();
    const blocked = fakeRes();

    await handleCancelChatQueueThread(missing, "kb_x");
    await handleCancelChatQueueThread(blocked, "kb_2");

    expect(missing.status).toBe(404);
    expect(blocked.status).toBe(409);
  });
});
