import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: (...args: unknown[]) => mockInsertKnowledgeSources(...args),
  MAX_SOURCES_PER_BATCH_ADD: 100,
}));

const { handleCreateKnowledgeSource } = await import("./knowledge-source.controller.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCreateKnowledgeSource", () => {
  it("400s on empty text, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: "" }), res);

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s on whitespace-only text, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: "   \n  " }), res);

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s when text is missing from the body", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({}), res);

    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe("text: Required");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s with a field-level message when text is the wrong type", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: 123 }), res);

    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe("text: Expected string, received number");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s when text exceeds 50,000 characters, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: "x".repeat(50_001) }), res);

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("accepts text at exactly the 50,000 character limit", async () => {
    mockInsertKnowledgeSource.mockResolvedValue({
      id: "ks_1",
      kind: "prose",
      rawText: "x".repeat(50_000),
      status: "pending",
      createdAt: new Date("2026-09-24T00:00:00.000Z"),
    });

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: "x".repeat(50_000) }), res);

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("x".repeat(50_000));
  });

  it("trims surrounding whitespace before storing and returns 201 with the created row", async () => {
    mockInsertKnowledgeSource.mockResolvedValue({
      id: "ks_1",
      kind: "prose",
      rawText: "hello prose",
      status: "pending",
      createdAt: new Date("2026-09-24T00:00:00.000Z"),
    });

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ text: "  hello prose  " }), res);

    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("hello prose");
    expect(res.status).toBe(201);
    expect((res.body as { status: string }).status).toBe("pending");
  });

  it("400s on an empty texts array, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ texts: [] }), res);

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });

  it("400s when every entry in texts is blank, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ texts: ["", "   "] }), res);

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });

  it("trims each text, drops blank entries, and inserts the rest as separate sources", async () => {
    mockInsertKnowledgeSources.mockResolvedValue([
      { id: "ks_1", kind: "prose", rawText: "First idea.", status: "pending", createdAt: new Date() },
      { id: "ks_2", kind: "prose", rawText: "Second idea.", status: "pending", createdAt: new Date() },
    ]);

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ texts: ["  First idea.  ", "", "Second idea."] }), res);

    expect(mockInsertKnowledgeSources).toHaveBeenCalledWith(["First idea.", "Second idea."]);
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
  });

  it("400s when texts exceeds the per-batch cap, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(
      fakeReq({ texts: Array.from({ length: 101 }, (_, i) => `Idea ${i}`) }),
      res,
    );

    expect(res.status).toBe(400);
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });
});
