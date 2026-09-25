import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const askKnowledgeBitChat = vi.fn();

vi.mock("./knowledge-bit-chat.service.js", () => ({
  askKnowledgeBitChat: (...args: unknown[]) => askKnowledgeBitChat(...args),
}));

const { handleAskKnowledgeBitChat } = await import("./knowledge-bit-chat.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
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

describe("handleAskKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches the parsed id and body to the service and returns the reply", async () => {
    askKnowledgeBitChat.mockResolvedValue({ reply: "It uses a three-way handshake." });

    const req = fakeReq({ message: "How does TCP connect?" });
    const res = fakeRes();

    await handleAskKnowledgeBitChat(req, res, "kb_1");

    expect(askKnowledgeBitChat).toHaveBeenCalledWith("kb_1", {
      message: "How does TCP connect?",
      allowGeneralKnowledge: false,
      allowWebSearch: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "It uses a three-way handshake." });
  });

  it("forwards true opt-in flags from the request body to the service", async () => {
    askKnowledgeBitChat.mockResolvedValue({ reply: "Current guidance says…" });

    const req = fakeReq({
      message: "What changed recently?",
      allowGeneralKnowledge: true,
      allowWebSearch: true,
    });
    const res = fakeRes();

    await handleAskKnowledgeBitChat(req, res, "kb_1");

    expect(askKnowledgeBitChat).toHaveBeenCalledWith("kb_1", {
      message: "What changed recently?",
      allowGeneralKnowledge: true,
      allowWebSearch: true,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 not_found when the service reports the bit is missing", async () => {
    askKnowledgeBitChat.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ message: "hi" });
    const res = fakeRes();

    await handleAskKnowledgeBitChat(req, res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("rejects an empty message with a 400 and never calls the service", async () => {
    const req = fakeReq({ message: "" });
    const res = fakeRes();

    await handleAskKnowledgeBitChat(req, res, "kb_1");

    expect(res.status).toBe(400);
    expect(askKnowledgeBitChat).not.toHaveBeenCalled();
  });
});
