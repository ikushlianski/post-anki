import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const editKnowledgeBit = vi.fn();

vi.mock("./knowledge-bit-edit.service.js", () => ({
  editKnowledgeBit: (...args: unknown[]) => editKnowledgeBit(...args),
}));

const { handleEditKnowledgeBit } = await import("./knowledge-bit-edit.controller.js");

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

describe("handleEditKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches the parsed id and body to the service and returns ok", async () => {
    editKnowledgeBit.mockResolvedValue({ ok: true });

    const req = fakeReq({ body: "Revised body text." });
    const res = fakeRes();

    await handleEditKnowledgeBit(req, res, "kb_1");

    expect(editKnowledgeBit).toHaveBeenCalledWith("kb_1", { body: "Revised body text." });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 404 not_found when the service reports the bit is missing", async () => {
    editKnowledgeBit.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ body: "Revised body text." });
    const res = fakeRes();

    await handleEditKnowledgeBit(req, res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("rejects an empty body with a 400 and never calls the service", async () => {
    const req = fakeReq({ body: "" });
    const res = fakeRes();

    await handleEditKnowledgeBit(req, res, "kb_1");

    expect(res.status).toBe(400);
    expect(editKnowledgeBit).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only body with a 400 and never calls the service", async () => {
    const req = fakeReq({ body: "   \n\t  " });
    const res = fakeRes();

    await handleEditKnowledgeBit(req, res, "kb_1");

    expect(res.status).toBe(400);
    expect(editKnowledgeBit).not.toHaveBeenCalled();
  });
});
