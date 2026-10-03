import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: (...args: unknown[]) => mockInsertKnowledgeSources(...args),
  MAX_SOURCES_PER_BATCH_ADD: 100,
}));

vi.mock("../shared/outbound-fetch.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/outbound-fetch.js")>(
    "../shared/outbound-fetch.js",
  );

  return {
    ...actual,
    fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  };
});

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

  it("fetches a url, strips HTML tags, and inserts the extracted text", async () => {
    mockFetchWithTimeout.mockResolvedValue("<html><body><h1>Title</h1><p>Hello world.</p></body></html>");
    mockInsertKnowledgeSource.mockResolvedValue({
      id: "ks_1",
      kind: "prose",
      rawText: "Title\n\nHello world.",
      status: "pending",
      createdAt: new Date("2026-09-24T00:00:00.000Z"),
    });

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/article" }), res);

    expect(mockFetchWithTimeout).toHaveBeenCalledWith("https://example.com/article", expect.any(Number));
    expect(mockInsertKnowledgeSource).toHaveBeenCalledTimes(1);

    const storedText = mockInsertKnowledgeSource.mock.calls[0]?.[0] as string;

    expect(storedText).not.toContain("<h1>");
    expect(storedText).not.toContain("<p>");
    expect(storedText.toLowerCase()).toContain("title");
    expect(storedText).toContain("Hello world.");
    expect(res.status).toBe(201);
  });

  it("400s with fetch_failed when the url can't be fetched, without inserting anything", async () => {
    mockFetchWithTimeout.mockResolvedValue(null);

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/missing" }), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("fetch_failed");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s with empty_content when the fetched page has no extractable text", async () => {
    mockFetchWithTimeout.mockResolvedValue("<html><body><script>var x = 1;</script></body></html>");

    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/blank" }), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("empty_content");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s on an invalid url, without inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq({ url: "not-a-url" }), res);

    expect(res.status).toBe(400);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("400s on a mixed url+text body, without fetching or inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(
      fakeReq({ url: "https://example.com/article", text: "Some pasted text." }),
      res,
    );

    expect(res.status).toBe(400);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });
});
