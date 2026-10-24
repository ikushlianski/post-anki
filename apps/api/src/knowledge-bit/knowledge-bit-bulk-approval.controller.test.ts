import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approveKnowledgeBitsBulk = vi.fn();
const countPendingKnowledgeBits = vi.fn();

const embedApprovedKnowledgeBits = vi.fn();

vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({
  embedApprovedKnowledgeBits: (...args: unknown[]) => embedApprovedKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-bulk-approval.repo.js", () => ({
  approveKnowledgeBitsBulk: (...args: unknown[]) => approveKnowledgeBitsBulk(...args),
  countPendingKnowledgeBits: (...args: unknown[]) => countPendingKnowledgeBits(...args),
}));

const { handleBulkApproveKnowledgeBits, handleCountPendingKnowledgeBits } = await import(
  "./knowledge-bit-bulk-approval.controller.js"
);

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

describe("handleBulkApproveKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the approved ids and the skipped ids with reasons", async () => {
    const result = {
      approved: ["kb_1"],
      skipped: [{ id: "kb_2", reason: "no_variant" }],
    };

    approveKnowledgeBitsBulk.mockResolvedValue(result);

    const res = fakeRes();

    await handleBulkApproveKnowledgeBits(fakeReq({ knowledgeBitIds: ["kb_1", "kb_2"] }), res);

    expect(approveKnowledgeBitsBulk).toHaveBeenCalledWith(["kb_1", "kb_2"]);
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it("should reject an empty id list without touching the repo", async () => {
    const res = fakeRes();

    await handleBulkApproveKnowledgeBits(fakeReq({ knowledgeBitIds: [] }), res);

    expect(res.status).toBe(400);
    expect(approveKnowledgeBitsBulk).not.toHaveBeenCalled();
  });

  it("should reject more than 200 ids", async () => {
    const res = fakeRes();
    const ids = Array.from({ length: 201 }, (_, i) => `kb_${i}`);

    await handleBulkApproveKnowledgeBits(fakeReq({ knowledgeBitIds: ids }), res);

    expect(res.status).toBe(400);
    expect(approveKnowledgeBitsBulk).not.toHaveBeenCalled();
  });
});

describe("handleCountPendingKnowledgeBits", () => {
  it("should return the pending count", async () => {
    countPendingKnowledgeBits.mockResolvedValue(7);

    const res = fakeRes();

    await handleCountPendingKnowledgeBits(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 7 });
  });
});
