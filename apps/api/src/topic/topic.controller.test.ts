import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Topic } from "@post-anki/shared";

const createTopic = vi.fn();
const deleteTopic = vi.fn();
const reorderTopics = vi.fn();
const updateTopic = vi.fn();

vi.mock("./topic.repo.js", () => ({
  createTopic: (...args: unknown[]) => createTopic(...args),
  deleteTopic: (...args: unknown[]) => deleteTopic(...args),
  reorderTopics: (...args: unknown[]) => reorderTopics(...args),
  updateTopic: (...args: unknown[]) => updateTopic(...args),
}));

const getTopicRow = vi.fn();

vi.mock("./topic-progress.repo.js", () => ({
  getTopicRow: (...args: unknown[]) => getTopicRow(...args),
}));

const listGapsForTopic = vi.fn();

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: (...args: unknown[]) => listGapsForTopic(...args),
}));

const refetchSource = vi.fn();

vi.mock("../content-library/content-library.service.js", () => ({
  refetchSource: (...args: unknown[]) => refetchSource(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { handleUpdateTopic } = await import("./topic.controller.js");
const { log } = await import("../shared/log.js");

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

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "top_1",
    moduleId: "mod_1",
    title: "Effects & Synchronization",
    order: 1,
    priority: 0,
    included: true,
    selfGrade: null,
    depth: "deep",
    learningStatus: "going_deeper",
    questions: [],
    progress: {
      status: "not_started",
      maturity: 0,
      attempts: 0,
      lastInteractedAt: null,
    },
    depthElectedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("handleUpdateTopic — going_deeper source re-fetch (SCENARIO 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateTopic.mockResolvedValue(makeTopic());
  });

  it("surfaces a successful re-fetch as goDeeperRefetch.outcome: ok", async () => {
    getTopicRow.mockResolvedValue({ sourceId: "src_1" });
    refetchSource.mockResolvedValue({
      sourceId: "src_1",
      outcome: "ok",
      lastFetchedAt: "2026-09-04T00:00:00.000Z",
      fetchedTextUpdated: true,
    });

    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ learningStatus: "going_deeper" }), res, "top_1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ goDeeperRefetch: { outcome: "ok" } });
  });

  it("surfaces a failed re-fetch outcome instead of only logging it, and does not block the depth update", async () => {
    getTopicRow.mockResolvedValue({ sourceId: "src_1" });
    refetchSource.mockResolvedValue({
      sourceId: "src_1",
      outcome: "http_error",
      lastFetchedAt: "2026-09-04T00:00:00.000Z",
      fetchedTextUpdated: false,
    });

    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ learningStatus: "going_deeper" }), res, "top_1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ goDeeperRefetch: { outcome: "http_error" } });
    expect(updateTopic).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: "top_1", learningStatus: "going_deeper" }),
    );
  });

  it("surfaces not_refetchable for a topic whose source has no re-fetchable URL", async () => {
    getTopicRow.mockResolvedValue({ sourceId: "src_1" });
    refetchSource.mockResolvedValue({ error: "not_refetchable" });

    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ learningStatus: "going_deeper" }), res, "top_1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ goDeeperRefetch: { outcome: "not_refetchable" } });
  });

  it("surfaces skipped when the topic has no sourceId at all, without calling refetchSource", async () => {
    getTopicRow.mockResolvedValue({ sourceId: null });

    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ learningStatus: "going_deeper" }), res, "top_1");

    expect(refetchSource).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ goDeeperRefetch: { outcome: "skipped" } });
  });

  it("surfaces network_error and logs when refetchSource rejects instead of resolving", async () => {
    getTopicRow.mockResolvedValue({ sourceId: "src_1" });
    refetchSource.mockRejectedValue(new Error("boom"));

    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ learningStatus: "going_deeper" }), res, "top_1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ goDeeperRefetch: { outcome: "network_error" } });
    expect(log.error).toHaveBeenCalled();
  });

  it("never attempts a re-fetch, and never adds goDeeperRefetch, for an update that is not going_deeper", async () => {
    const res = fakeRes();

    await handleUpdateTopic(fakeReq({ priority: 1 }), res, "top_1");

    expect(getTopicRow).not.toHaveBeenCalled();
    expect(refetchSource).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("goDeeperRefetch");
  });
});
