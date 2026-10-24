import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteKnowledgeBitsBulk = vi.fn();

vi.mock("./knowledge-bit-delete.repo.js", () => ({
  deleteKnowledgeBitsBulk: (...args: unknown[]) => deleteKnowledgeBitsBulk(...args),
}));

const { handleBulkDeleteKnowledgeBits } = await import("./knowledge-bit-delete.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
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

describe("handleBulkDeleteKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return deleted ids and skipped ids with reasons", async () => {
    const result = { deleted: ["kb_1"], skipped: [{ id: "kb_2", reason: "not_approved" }] };

    deleteKnowledgeBitsBulk.mockResolvedValue(result);

    const res = fakeRes();

    await handleBulkDeleteKnowledgeBits(fakeReq({ knowledgeBitIds: ["kb_1", "kb_2"] }), res);

    expect(deleteKnowledgeBitsBulk).toHaveBeenCalledWith(["kb_1", "kb_2"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it("should reject an empty selection without touching the repo", async () => {
    const res = fakeRes();

    await handleBulkDeleteKnowledgeBits(fakeReq({ knowledgeBitIds: [] }), res);

    expect(res.status).toBe(400);
    expect(deleteKnowledgeBitsBulk).not.toHaveBeenCalled();
  });

  it("should reject more than 200 ids without touching the repo", async () => {
    const res = fakeRes();
    const ids = Array.from({ length: 201 }, (_, i) => `kb_${i}`);

    await handleBulkDeleteKnowledgeBits(fakeReq({ knowledgeBitIds: ids }), res);

    expect(res.status).toBe(400);
    expect(deleteKnowledgeBitsBulk).not.toHaveBeenCalled();
  });
});
