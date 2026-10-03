import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const draftKnowledgeBitChat = vi.fn();

vi.mock("./knowledge-bit-chat-draft.service.js", () => ({
  draftKnowledgeBitChat: (...args: unknown[]) => draftKnowledgeBitChat(...args),
}));

const { handleDraftKnowledgeBitChat } = await import("./knowledge-bit-chat-draft.controller.js");

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

describe("handleDraftKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches the parsed id and body to the service and returns the proposed body", async () => {
    draftKnowledgeBitChat.mockResolvedValue({ proposedBody: "Revised body text." });

    const req = fakeReq({
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "kb_1");

    expect(draftKnowledgeBitChat).toHaveBeenCalledWith("kb_1", {
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proposedBody: "Revised body text." });
  });

  it("returns 404 not_found when the service reports the bit is missing", async () => {
    draftKnowledgeBitChat.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ transcript: [], mode: "edit" });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should return 403 not_approved when the service reports the bit isn't approved yet", async () => {
    draftKnowledgeBitChat.mockResolvedValue({ error: "not_approved" });

    const req = fakeReq({ transcript: [], mode: "edit" });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "kb_1");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_approved" });
  });

  it("returns 502 draft_failed when the service reports a drafting failure", async () => {
    draftKnowledgeBitChat.mockResolvedValue({ error: "draft_failed" });

    const req = fakeReq({ transcript: [], mode: "edit" });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "kb_1");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "draft_failed" });
  });

  it("rejects a missing mode with a 400 and never calls the service", async () => {
    const req = fakeReq({ transcript: [] });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "kb_1");

    expect(res.status).toBe(400);
    expect(draftKnowledgeBitChat).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode value with a 400 and never calls the service", async () => {
    const req = fakeReq({ transcript: [], mode: "delete" });
    const res = fakeRes();

    await handleDraftKnowledgeBitChat(req, res, "kb_1");

    expect(res.status).toBe(400);
    expect(draftKnowledgeBitChat).not.toHaveBeenCalled();
  });
});
