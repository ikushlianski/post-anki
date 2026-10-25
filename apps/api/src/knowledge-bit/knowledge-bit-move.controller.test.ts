import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";

const mockMove = vi.fn();

vi.mock("./knowledge-bit-move.repo.js", () => ({
  moveKnowledgeBitsBulk: (...args: unknown[]) => mockMove(...args),
}));

const { handleBulkMoveKnowledgeBits } = await import("./knowledge-bit-move.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const chunks: Buffer[] = [];
  let statusCode = 0;

  const res = {
    writeHead: (code: number) => {
      statusCode = code;
      return res;
    },
    end: (chunk: unknown) => {
      if (chunk) chunks.push(Buffer.from(chunk as string));
    },
    get statusCode() {
      return statusCode;
    },
    json() {
      return JSON.parse(chunks.map((c) => c.toString()).join(""));
    },
  };

  return res as unknown as http.ServerResponse & { statusCode: number; json(): unknown };
}

describe("handleBulkMoveKnowledgeBits", () => {
  it("should return 400 for missing subjectId", async () => {
    const res = fakeRes();
    await handleBulkMoveKnowledgeBits(fakeReq({ knowledgeBitIds: ["kb_1"] }), res);

    expect(res.statusCode).toBe(400);
    expect(mockMove).not.toHaveBeenCalled();
  });

  it("should return 404 when subject is not found", async () => {
    mockMove.mockResolvedValue({ error: "subject_not_found" });

    const res = fakeRes();
    await handleBulkMoveKnowledgeBits(
      fakeReq({ knowledgeBitIds: ["kb_1"], subjectId: "sub_1" }),
      res,
    );

    expect(res.statusCode).toBe(404);
  });

  it("should return 200 with moved and skipped arrays on success", async () => {
    mockMove.mockResolvedValue({ moved: ["kb_1"], skipped: [] });

    const res = fakeRes();
    await handleBulkMoveKnowledgeBits(
      fakeReq({ knowledgeBitIds: ["kb_1"], subjectId: "sub_1" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ moved: ["kb_1"], skipped: [] });
  });

  it("should call moveKnowledgeBitsBulk with the parsed ids and subjectId", async () => {
    mockMove.mockResolvedValue({ moved: [], skipped: [] });

    await handleBulkMoveKnowledgeBits(
      fakeReq({ knowledgeBitIds: ["kb_1", "kb_2"], subjectId: "sub_42" }),
      fakeRes(),
    );

    expect(mockMove).toHaveBeenCalledWith(["kb_1", "kb_2"], "sub_42");
  });

  it("should pass curriculum_placed skip reason through unchanged", async () => {
    mockMove.mockResolvedValue({
      moved: [],
      skipped: [{ id: "kb_1", reason: "curriculum_placed" }],
    });

    const res = fakeRes();
    await handleBulkMoveKnowledgeBits(
      fakeReq({ knowledgeBitIds: ["kb_1"], subjectId: "sub_1" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ moved: [], skipped: [{ id: "kb_1", reason: "curriculum_placed" }] });
  });
});
