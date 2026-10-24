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

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAssignmentError.mockResolvedValue(null);
  mockInsertKnowledgeSource.mockResolvedValue({ id: "ks_1", kind: "prose", status: "pending" });
});

describe("handleCreateKnowledgeSource refusal reasons", () => {
  it("should tell the learner the page could not be opened when the fetch fails", async () => {
    mockFetchWithTimeout.mockResolvedValue(null);

    const res = await post({ url: "https://example.com/a" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "fetch_failed", message: "That page could not be opened." });
  });

  it("should tell the learner the page has no readable text for an empty page", async () => {
    mockFetchWithTimeout.mockResolvedValue("<html><body><script>1</script></body></html>");

    const res = await post({ url: "https://example.com/a" });

    expect(res.body).toEqual({ error: "empty_content", message: "That page has no readable text." });
  });

  it("should tell the learner the subject is gone, keeping the subject_not_found code", async () => {
    mockFindAssignmentError.mockResolvedValue("subject_not_found");

    const res = await post({ url: "https://example.com/a", subjectId: "nope" });

    expect(res.body).toEqual({
      error: "subject_not_found",
      message: "The chosen subject no longer exists. Pick another subject.",
    });
  });

  it("should keep invalid_input and add a plain too-long reason for text over 50,000 characters", async () => {
    const res = await post({ text: "a".repeat(50_001) });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "invalid_input",
      reason: "text_too_long",
      message: expect.stringContaining("longer than 50,000 characters"),
    });
  });

  it("should flag a too-long text inside a batch the same way", async () => {
    const res = await post({ texts: ["fine", "a".repeat(50_001)] });

    expect(res.body).toMatchObject({ error: "invalid_input", reason: "text_too_long" });
  });

  it("should not add a reason to other invalid input", async () => {
    const res = await post({ url: "not-a-url" });

    expect(res.body).not.toHaveProperty("reason");
  });

  it("should report truncated true when an imported page is cut at 50,000 characters", async () => {
    mockFetchWithTimeout.mockResolvedValue(`<html><body><p>${"word ".repeat(12_000)}</p></body></html>`);

    const res = await post({ url: "https://example.com/long" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "ks_1", truncated: true });
    expect((mockInsertKnowledgeSource.mock.calls[0]?.[0] as string).length).toBe(50_000);
  });

  it("should report truncated false when the whole page was read", async () => {
    mockFetchWithTimeout.mockResolvedValue("<html><body><p>Short page.</p></body></html>");

    const res = await post({ url: "https://example.com/short" });

    expect(res.body).toMatchObject({ id: "ks_1", truncated: false });
  });
});
