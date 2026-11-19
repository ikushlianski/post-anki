import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";

const mockSet = vi.fn();

vi.mock("./knowledge-bit-user-note.repo.js", () => ({
  setKnowledgeBitUserNote: (...args: unknown[]) => mockSet(...args),
}));

const { handleSetKnowledgeBitUserNote } = await import("./knowledge-bit-user-note.controller.js");

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

describe("handleSetKnowledgeBitUserNote", () => {
  it("should reject a note longer than 2000 characters so the learner is told it was not saved", async () => {
    const res = fakeRes();
    await handleSetKnowledgeBitUserNote(fakeReq({ note: "x".repeat(2001) }), res, "kb_1");

    expect(res.statusCode).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("should save a note and return it", async () => {
    mockSet.mockResolvedValueOnce({ userNote: "mine" });
    const res = fakeRes();
    await handleSetKnowledgeBitUserNote(fakeReq({ note: "mine" }), res, "kb_1");

    expect(mockSet).toHaveBeenCalledWith("kb_1", "mine");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userNote: "mine" });
  });

  it("should accept an empty note so the learner can clear it", async () => {
    mockSet.mockResolvedValueOnce({ userNote: null });
    const res = fakeRes();
    await handleSetKnowledgeBitUserNote(fakeReq({ note: "" }), res, "kb_1");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userNote: null });
  });

  it("should return 404 for a card that does not exist", async () => {
    mockSet.mockResolvedValueOnce(null);
    const res = fakeRes();
    await handleSetKnowledgeBitUserNote(fakeReq({ note: "a" }), res, "missing");

    expect(res.statusCode).toBe(404);
  });
});
