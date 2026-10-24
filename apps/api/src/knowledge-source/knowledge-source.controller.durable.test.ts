import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockKick = vi.fn();
const mockStart = vi.fn();
const mockEnabled = vi.fn();

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
vi.mock("../subject/subject-leaf.js", () => ({ findSubjectAssignmentError: vi.fn().mockResolvedValue(null) }));
vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({
  startKnowledgeBitPipelineKick: () => mockKick(),
}));
vi.mock("../knowledge-bit/durable-extraction.starter.js", () => ({
  isDurableExtractionEnabled: () => mockEnabled(),
  startDurableExtraction: (...args: unknown[]) => mockStart(...args),
}));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const { handleCreateKnowledgeSource } = await import("./knowledge-source.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse {
  const res = { writeHead: () => res, end: () => undefined };

  return res as unknown as http.ServerResponse;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1" });
  mockInsertKnowledgeSources.mockResolvedValue([{ id: "ks_1" }, { id: "ks_2" }]);
  mockKick.mockResolvedValue(undefined);
});

describe("knowledge source creation and the durable extraction flag", () => {
  it("should keep kicking the old pipeline and never start a workflow while the flag is off", async () => {
    mockEnabled.mockReturnValue(false);

    await handleCreateKnowledgeSource(fakeReq({ text: "some text" }), fakeRes());
    await flush();

    expect(mockKick).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("should start one workflow for the new source and skip the old pipeline when the flag is on", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockResolvedValue({ started: ["ks_1:1"], fallbackIds: [] });

    await handleCreateKnowledgeSource(fakeReq({ text: "some text" }), fakeRes());
    await flush();

    expect(mockStart).toHaveBeenCalledWith(["ks_1"], { regeneration: false });
    expect(mockKick).not.toHaveBeenCalled();
  });

  it("should start a workflow for every source of a batch", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockResolvedValue({ started: ["ks_1:1", "ks_2:1"], fallbackIds: [] });

    await handleCreateKnowledgeSource(fakeReq({ texts: ["one", "two"] }), fakeRes());
    await flush();

    expect(mockStart).toHaveBeenCalledWith(["ks_1", "ks_2"], { regeneration: false });
    expect(mockKick).not.toHaveBeenCalled();
  });

  it("should fall back to the old pipeline when a source could not be started durably", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockResolvedValue({ started: [], fallbackIds: ["ks_1"] });

    await handleCreateKnowledgeSource(fakeReq({ text: "some text" }), fakeRes());
    await flush();

    expect(mockKick).toHaveBeenCalledTimes(1);
  });

  it("should fall back to the old pipeline when starting throws, so no source is lost", async () => {
    mockEnabled.mockReturnValue(true);
    mockStart.mockRejectedValue(new Error("engine down"));

    await handleCreateKnowledgeSource(fakeReq({ text: "some text" }), fakeRes());
    await flush();

    expect(mockKick).toHaveBeenCalledTimes(1);
  });
});
