import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: vi.fn().mockResolvedValue(null),
  findEarlierSourcesByText: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: vi.fn(),
  MAX_SOURCES_PER_BATCH_ADD: 100,
  updateKnowledgeSourceSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../mastra/article-summary.agent.js", () => ({
  runArticleSummary: vi.fn().mockResolvedValue("Summary."),
}));

vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({
  startKnowledgeBitPipelineKick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

vi.mock("../shared/outbound-fetch.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/outbound-fetch.js")>(
    "../shared/outbound-fetch.js",
  );

  return { ...actual, fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args) };
});

const { handleCreateKnowledgeSource } = await import("./knowledge-source.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = {
    status: null as number | null,
    body: "",
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(chunk?: string) {
      res.body = chunk ?? "";
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1" });
});

describe("handleCreateKnowledgeSource page context", () => {
  it("should store the page link and a Page line for a capture with a link and title", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(
      fakeReq({ text: "hello prose", sourceUrl: "https://example.com/a", title: "My\nArticle" }),
      res,
    );

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith(
      "Page: My Article\nhello prose",
      null,
      null,
      "https://example.com/a",
    );
  });

  it.each(["http://localhost/x", "javascript:alert(1)"])(
    "should accept the capture but store no link for unsafe link %s",
    async (sourceUrl) => {
      const res = fakeRes();

      await handleCreateKnowledgeSource(fakeReq({ text: "hello prose", sourceUrl }), res);

      expect(res.status).toBe(201);
      expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("hello prose", null, null);
    },
  );

  it("should behave like a plain paste when no link or title is sent", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "hello prose", title: "   " }), res);

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("hello prose", null, null);
  });

  it("should keep the stored text within the maximum length when a title is added", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "x".repeat(50_000), title: "T" }), res);

    const stored = vi.mocked(mockInsertKnowledgeSource).mock.calls[0]?.[0] as string;

    expect(stored.startsWith("Page: T\n")).toBe(true);
    expect(stored.length).toBe(50_000);
  });

  it("should reject an over-length title or link with invalid_input", async () => {
    const longTitle = fakeRes();
    const longUrl = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "hi", title: "t".repeat(301) }), longTitle);
    await handleCreateKnowledgeSource(
      fakeReq({ text: "hi", sourceUrl: `https://example.com/${"a".repeat(2048)}` }),
      longUrl,
    );

    expect(longTitle.status).toBe(400);
    expect(longTitle.body).toContain("invalid_input");
    expect(longUrl.status).toBe(400);
    expect(longUrl.body).toContain("invalid_input");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("should not fetch the page when the body carries a sourceUrl", async () => {
    await handleCreateKnowledgeSource(
      fakeReq({ text: "hello", sourceUrl: "https://example.com/a" }),
      fakeRes(),
    );

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
