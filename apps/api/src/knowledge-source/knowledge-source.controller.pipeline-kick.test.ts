import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockKick = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: vi.fn().mockResolvedValue(null),
  findEarlierSourcesByText: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: (...args: unknown[]) => mockInsertKnowledgeSources(...args),
  MAX_SOURCES_PER_BATCH_ADD: 100,
  updateKnowledgeSourceSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../mastra/article-summary.agent.js", () => ({
  runArticleSummary: vi.fn().mockResolvedValue("Summary."),
}));

vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({
  startKnowledgeBitPipelineKick: () => mockKick(),
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

function fakeRes(events: string[] = []) {
  const res = {
    status: null as number | null,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end() {
      events.push("response");
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockKick.mockResolvedValue(undefined);
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1" });
  mockInsertKnowledgeSources.mockResolvedValue([{ id: "ks_1" }]);
  mockFetchWithTimeout.mockResolvedValue("<p>some page text</p>");
});

describe("handleCreateKnowledgeSource pipeline kick", () => {
  it("should hand processing off before the response so a Lambda freeze cannot drop it, for a single paste", async () => {
    const events: string[] = [];

    mockKick.mockImplementation(async () => {
      events.push("kick");
    });

    const res = fakeRes(events);

    await handleCreateKnowledgeSource(fakeReq({ text: "hello" }), res);

    expect(res.status).toBe(201);
    expect(events).toEqual(["kick", "response"]);
  });

  it("should start processing once for a multi-paste", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ texts: ["a", "b"] }), res);

    expect(res.status).toBe(201);
    expect(mockKick).toHaveBeenCalledTimes(1);
  });

  it("should start processing once for a link import", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com/page" }), res);

    expect(res.status).toBe(201);
    expect(mockKick).toHaveBeenCalledTimes(1);
  });

  it("should not start processing when input is rejected", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(null);

    await handleCreateKnowledgeSource(fakeReq({ text: "" }), fakeRes());
    await handleCreateKnowledgeSource(fakeReq({ texts: ["  "] }), fakeRes());
    await handleCreateKnowledgeSource(fakeReq({ url: "not a url" }), fakeRes());
    await handleCreateKnowledgeSource(fakeReq({ url: "https://example.com" }), fakeRes());

    expect(mockKick).not.toHaveBeenCalled();
  });

  it("should not start processing when saving fails", async () => {
    mockInsertKnowledgeSource.mockRejectedValue(new Error("db down"));

    await expect(handleCreateKnowledgeSource(fakeReq({ text: "hello" }), fakeRes())).rejects.toThrow("db down");

    expect(mockKick).not.toHaveBeenCalled();
  });

  it("should keep the 201 and raise no unhandled rejection when the kick rejects", async () => {
    mockKick.mockRejectedValue(new Error("kick boom"));

    const unhandled = vi.fn();

    process.once("unhandledRejection", unhandled);

    const res = fakeRes();

    await handleCreateKnowledgeSource(fakeReq({ text: "hello" }), res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toBe(201);
    expect(unhandled).not.toHaveBeenCalled();

    process.removeListener("unhandledRejection", unhandled);
  });
});
