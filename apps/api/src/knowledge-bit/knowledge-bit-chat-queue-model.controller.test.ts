import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({ loadChatCardContext: vi.fn().mockResolvedValue(null) }));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({ sendChatQueueMessage: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue-web-tools.js", () => ({
  createChatQueueWebTools: () => ({ deps: {}, getUsage: () => ({ searches: 0, fetches: 0 }) }),
}));
vi.mock("./knowledge-bit-chat-queue-export.markdown.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-search.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-export.repo.js", () => ({}));
vi.mock("./ask-ai-chat-retry.js", () => ({}));
vi.mock("./knowledge-bit-chat-thread-retention.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-stale.repo.js", () => ({}));
vi.mock("./chat-first-reply.orchestrator.js", () => ({}));
vi.mock("../background-job/background-job.starter.js", () => ({}));

const { sendChatQueueMessage } = await import("./knowledge-bit-chat-queue.service.js");
const { handleSendChatQueueMessage } = await import("./knowledge-bit-chat-queue.controller.js");

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

function fakeReq(body: unknown) {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

describe("handleSendChatQueueMessage model choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should refuse a model id outside the allow-list without calling the model", async () => {
    const res = fakeRes();

    await handleSendChatQueueMessage(
      fakeReq({ clientMessageId: "c1", message: "hi", modelId: "openrouter/evil/free-model" }),
      res,
      "kb1",
    );

    expect(res.status).toBe(400);
    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should hand an allow-listed model id on to the chat service", async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      value: { reply: "ok", replySeq: 2, turnsLeft: 3, capReached: false },
    });
    const res = fakeRes();

    await handleSendChatQueueMessage(
      fakeReq({ clientMessageId: "c1", message: "hi", modelId: "openrouter/openai/gpt-5-mini" }),
      res,
      "kb1",
    );

    expect(res.status).toBe(200);
    expect(sendChatQueueMessage).toHaveBeenCalledWith(
      "kb1",
      expect.objectContaining({ modelId: "openrouter/openai/gpt-5-mini" }),
      expect.anything(),
    );
  });
});
