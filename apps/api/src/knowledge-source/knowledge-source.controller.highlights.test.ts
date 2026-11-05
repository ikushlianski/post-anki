import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockSplitLongPaste = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: vi.fn().mockResolvedValue(null),
  findEarlierSplitSource: vi.fn().mockResolvedValue(null),
  findEarlierSourcesByText: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./long-paste-split.orchestrator.js", () => ({
  splitLongPaste: (...args: unknown[]) => mockSplitLongPaste(...args),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: (...args: unknown[]) => mockInsertKnowledgeSources(...args),
  insertSplitKnowledgeSources: vi.fn(),
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

const { handleCreateKnowledgeSource } = await import("./knowledge-source.controller.js");
const { findEarlierSplitSource } = await import("./knowledge-source-duplicate.repo.js");

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

const LONG_TEXT = `${"A sentence about salt and ice. ".repeat(300)}`.trim();

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1" });
  mockSplitLongPaste.mockResolvedValue(null);
});

describe("handleCreateKnowledgeSource highlights", () => {
  it("should store merged marks on the single source", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(
      fakeReq({ text: "alpha beta gamma delta", highlights: [{ start: 6, end: 10 }, { start: 0, end: 7 }] }),
      res,
    );

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith(
      "alpha beta gamma delta",
      null,
      null,
      null,
      undefined,
      [{ start: 0, end: 10 }],
    );
  });

  it("should shift marks by the page title line so they still point at the stored text", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(
      fakeReq({ text: "alpha beta", title: "My Page", highlights: [{ start: 6, end: 10 }] }),
      res,
    );

    const stored = mockInsertKnowledgeSource.mock.calls[0]?.[0] as string;
    const marks = mockInsertKnowledgeSource.mock.calls[0]?.[5] as { start: number; end: number }[];

    expect(stored).toBe("Page: My Page\nalpha beta");
    expect(stored.slice(marks[0]?.start, marks[0]?.end)).toBe("beta");
  });

  it("should not split a long paste when the learner marked passages", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: LONG_TEXT, highlights: [{ start: 0, end: 20 }] }), res);

    expect(res.status).toBe(201);
    expect(mockSplitLongPaste).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSource).toHaveBeenCalledTimes(1);
  });

  it("should still try to split a long paste without marks", async () => {
    await handleCreateKnowledgeSource(fakeReq({ text: LONG_TEXT }), fakeRes());

    expect(mockSplitLongPaste).toHaveBeenCalled();
  });

  it("should store no marks field when none are sent", async () => {
    await handleCreateKnowledgeSource(fakeReq({ text: "hello prose" }), fakeRes());

    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("hello prose", null, null);
  });

  it.each([
    ["a range past the text end", [{ start: 0, end: 99 }]],
    ["an empty range", [{ start: 3, end: 3 }]],
    ["a negative start", [{ start: -1, end: 3 }]],
    ["a fractional offset", [{ start: 0.5, end: 3 }]],
    ["more than 20 ranges", Array.from({ length: 21 }, (_, i) => ({ start: i, end: i + 1 }))],
  ])("should reject %s with invalid_input", async (_label, highlights) => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "x".repeat(40), highlights }), res);

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_input");
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("should reject marks on a batch add", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ texts: ["one", "two"], highlights: [{ start: 0, end: 2 }] }), res);

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_input");
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should reject marks on a link add", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(
      fakeReq({ url: "https://example.com/a", highlights: [{ start: 0, end: 2 }] }),
      res,
    );

    expect(res.status).toBe(400);
  });

  it("should refuse a marked long paste already imported as split parts, without splitting", async () => {
    vi.mocked(findEarlierSplitSource).mockResolvedValueOnce({ id: "ks_old", addedAt: "2026-01-01T00:00:00.000Z" } as never);
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: LONG_TEXT, highlights: [{ start: 0, end: 20 }] }), res);

    expect(res.status).toBe(409);
    expect(mockSplitLongPaste).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("should point marks at the trimmed text when the body has leading whitespace", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "   alpha beta  ", highlights: [{ start: 9, end: 13 }] }), res);

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledWith("alpha beta", null, null, null, undefined, [
      { start: 6, end: 10 },
    ]);
  });
});
