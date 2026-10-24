import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockUpdateSummary = vi.fn();
const mockRunArticleSummary = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockLogError = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: vi.fn().mockResolvedValue(null),
  findEarlierSourcesByText: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: vi.fn(),
  MAX_SOURCES_PER_BATCH_ADD: 100,
  updateKnowledgeSourceSummary: (...args: unknown[]) => mockUpdateSummary(...args),
}));

vi.mock("../mastra/article-summary.agent.js", () => ({
  runArticleSummary: (...args: unknown[]) => mockRunArticleSummary(...args),
}));

vi.mock("../subject/subject-leaf.js", () => ({ findSubjectAssignmentError: vi.fn().mockResolvedValue(null) }));

vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({
  startKnowledgeBitPipelineKick: () => Promise.resolve(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: (...args: unknown[]) => mockLogError(...args), info: vi.fn() },
}));

vi.mock("../shared/outbound-fetch.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/outbound-fetch.js")>("../shared/outbound-fetch.js");

  return { ...actual, fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args) };
});

const { handleCreateKnowledgeSource } = await import("./knowledge-source.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = {
    status: null as number | null,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end() {},
  };

  return res as unknown as http.ServerResponse & { status: number | null };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWithTimeout.mockResolvedValue("<html><body><p>Hello world.</p></body></html>");
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1" });
  mockRunArticleSummary.mockResolvedValue("A short summary.");
  mockUpdateSummary.mockResolvedValue(undefined);
});

describe("handleCreateKnowledgeSource article import", () => {
  it("should keep the article link on the stored source", async () => {
    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/article" }), fakeRes());

    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith(
      expect.any(String),
      null,
      null,
      "https://example.com/article",
    );
  });

  it("should not keep a link that fails the safe-url check", async () => {
    await handleCreateKnowledgeSource(fakeReq({ url: "http://127.0.0.1/admin" }), fakeRes());

    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith(expect.any(String), null, null, null);
  });

  it("should store the generated summary on the source after answering 201", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/article" }), res);
    await flush();

    expect(res.status).toBe(201);
    expect(mockRunArticleSummary).toHaveBeenCalledWith(expect.stringContaining("Hello world."));
    expect(mockUpdateSummary).toHaveBeenCalledWith("ks_1", "A short summary.");
  });

  it("should still answer 201 and log when the summary agent fails", async () => {
    mockRunArticleSummary.mockRejectedValue(new Error("model down"));
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/article" }), res);
    await flush();

    expect(res.status).toBe(201);
    expect(mockUpdateSummary).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "ks_1" }), "article_summary_failed");
  });

  it("should not summarise pasted text", async () => {
    await handleCreateKnowledgeSource(fakeReq({ text: "pasted prose" }), fakeRes());
    await flush();

    expect(mockRunArticleSummary).not.toHaveBeenCalled();
  });
});
