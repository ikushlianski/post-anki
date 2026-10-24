import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockFindAssignmentError = vi.fn();

const mockFindByUrl = vi.fn();
const mockFindByText = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: (...args: unknown[]) => mockFindByUrl(...args),
  findEarlierSourcesByText: (...args: unknown[]) => mockFindByText(...args),
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

vi.mock("../subject/subject-leaf.js", () => ({
  findSubjectAssignmentError: (...args: unknown[]) => mockFindAssignmentError(...args),
}));

vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({
  startKnowledgeBitPipelineKick: () => Promise.resolve(),
}));

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

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

type FakeRes = http.ServerResponse & { status: number | null; body: unknown };

function fakeReq(raw: string): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(raw);
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): FakeRes {
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

  return res as unknown as FakeRes;
}

async function post(body: unknown): Promise<FakeRes> {
  const res = fakeRes();
  await handleCreateKnowledgeSource(fakeReq(JSON.stringify(body)), res);

  return res;
}

const earlier = { id: "ks_old", addedAt: "2026-02-03T10:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAssignmentError.mockResolvedValue(null);
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_new", kind: "prose", status: "pending" });
  mockInsertKnowledgeSources.mockResolvedValue([{ id: "ks_new" }]);
  mockFetchWithTimeout.mockResolvedValue("<html><body><p>Readable article text.</p></body></html>");
  mockFindByUrl.mockResolvedValue(null);
  mockFindByText.mockResolvedValue(new Map());
});

describe("handleCreateKnowledgeSource duplicate warning", () => {
  it("should refuse a link already added, naming the earlier source and its date", async () => {
    mockFindByUrl.mockResolvedValue(earlier);

    const res = await post({ url: "https://example.com/a" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: "already_added",
      message: "This was already added.",
      existingId: "ks_old",
      addedAt: earlier.addedAt,
    });
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("should look the link up by its final address within the same subject", async () => {
    mockFetchWithTimeout.mockImplementation(async (_url: string, _ms: number, onFinal: (u: string) => void) => {
      onFinal("https://Example.com/final/");

      return "<html><body><p>Readable.</p></body></html>";
    });

    await post({ url: "https://short.example/x", subjectId: "sub_web" });

    expect(mockFindByUrl).toHaveBeenCalledWith("https://Example.com/final/", "sub_web");
  });

  it("should add the link again when the learner forces it", async () => {
    mockFindByUrl.mockResolvedValue(earlier);

    const res = await post({ url: "https://example.com/a", force: true });

    expect(res.status).toBe(201);
    expect(mockFindByUrl).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSource).toHaveBeenCalledTimes(1);
  });

  it("should refuse a text identical to one already added", async () => {
    mockFindByText.mockResolvedValue(new Map([["Same prose", earlier]]));

    const res = await post({ text: "  Same prose \n" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "already_added", existingId: "ks_old" });
    expect(mockFindByText).toHaveBeenCalledWith(["Same prose"], null);
    expect(mockInsertKnowledgeSource).not.toHaveBeenCalled();
  });

  it("should add the identical text again when the learner forces it", async () => {
    mockFindByText.mockResolvedValue(new Map([["Same prose", earlier]]));

    const res = await post({ text: "Same prose", force: true });

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSource).toHaveBeenCalledTimes(1);
  });

  it("should add a new text when nothing identical exists", async () => {
    const res = await post({ text: "Fresh prose" });

    expect(res.status).toBe(201);
  });

  it("should say which blocks of a batch were already added and add none", async () => {
    mockFindByText.mockResolvedValue(new Map([["Second", earlier]]));

    const res = await post({ texts: ["First", "Second"] });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: "already_added",
      duplicates: [{ index: 1, existingId: "ks_old", addedAt: earlier.addedAt }],
    });
    expect(mockInsertKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should add a forced batch even when its texts were added before", async () => {
    mockFindByText.mockResolvedValue(new Map([["First", earlier]]));

    const res = await post({ texts: ["First", "Second"], force: true });

    expect(res.status).toBe(201);
    expect(mockInsertKnowledgeSources).toHaveBeenCalledTimes(1);
  });
});
