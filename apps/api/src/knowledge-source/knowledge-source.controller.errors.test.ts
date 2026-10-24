import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertKnowledgeSource = vi.fn();
const mockInsertKnowledgeSources = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockFindAssignmentError = vi.fn();

vi.mock("./knowledge-source-duplicate.repo.js", () => ({
  findEarlierSourceByUrl: vi.fn().mockResolvedValue(null),
  findEarlierSourcesByText: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSource: (...args: unknown[]) => mockInsertKnowledgeSource(...args),
  insertKnowledgeSources: (...args: unknown[]) => mockInsertKnowledgeSources(...args),
  MAX_SOURCES_PER_BATCH_ADD: 2,
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

function expectError(res: FakeRes, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: code, message: expect.stringMatching(/\S/) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAssignmentError.mockResolvedValue(null);
});

describe("handleCreateKnowledgeSource error replies", () => {
  it("should reply 400 invalid_input with a message for an invalid url body", async () => {
    expectError(await post({ url: "not-a-url" }), 400, "invalid_input");
  });

  it("should reply 400 subject_not_found with a message for an unknown subject on a url source", async () => {
    mockFindAssignmentError.mockResolvedValue("subject_not_found");

    expectError(await post({ url: "https://example.com/a", subjectId: "nope" }), 400, "subject_not_found");
  });

  it("should reply 400 fetch_failed with a message when the page cannot be fetched", async () => {
    mockFetchWithTimeout.mockResolvedValue(null);

    expectError(await post({ url: "https://example.com/a" }), 400, "fetch_failed");
  });

  it("should reply 400 empty_content with a message when the page has no readable text", async () => {
    mockFetchWithTimeout.mockResolvedValue("<html><body><script>1</script></body></html>");

    expectError(await post({ url: "https://example.com/a" }), 400, "empty_content");
  });

  it("should reply 400 invalid_input with a message for an invalid batch body", async () => {
    expectError(await post({ texts: [] }), 400, "invalid_input");
  });

  it("should reply 400 subject_not_found with a message for an unknown subject on a batch", async () => {
    mockFindAssignmentError.mockResolvedValue("subject_not_found");

    expectError(await post({ texts: ["a"], subjectId: "nope" }), 400, "subject_not_found");
  });

  it("should reply 400 invalid_input with a message when every batch text is blank", async () => {
    expectError(await post({ texts: ["  ", ""] }), 400, "invalid_input");
  });

  it("should reply 400 invalid_input with a message when the batch exceeds the cap", async () => {
    expectError(await post({ texts: ["a", "b", "c"] }), 400, "invalid_input");
  });

  it("should reply 400 invalid_input with a message when the body is not valid JSON", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSource(fakeReq("{not json"), res);

    expectError(res, 400, "invalid_input");
  });

  it("should reply 400 invalid_input with a message for an invalid single-text body", async () => {
    expectError(await post({ text: 123 }), 400, "invalid_input");
  });

  it("should reply 400 invalid_input with a message for blank single text", async () => {
    expectError(await post({ text: "   " }), 400, "invalid_input");
  });

  it("should reply 400 subject_not_found with a message for an unknown subject on single text", async () => {
    mockFindAssignmentError.mockResolvedValue("subject_not_found");

    expectError(await post({ text: "hello", subjectId: "nope" }), 400, "subject_not_found");
  });
});
