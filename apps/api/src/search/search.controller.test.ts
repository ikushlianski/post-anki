import type http from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TopicModuleSearchResult } from "@post-anki/shared";

const mockListNodesByTagId = vi.fn();

vi.mock("./list-nodes-by-tag.repo.js", () => ({
  listNodesByTagId: (...args: unknown[]) => mockListNodesByTagId(...args),
}));

const { handleListTagNodes } = await import("./search.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    setHeader() {
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

function node(overrides: Partial<TopicModuleSearchResult> & { id: string }): TopicModuleSearchResult {
  return {
    kind: "topic",
    title: "Timeouts and retries",
    curriculumId: "cur_1",
    curriculumName: "Reliability",
    rank: 0,
    tags: [{ id: "tag_performance", name: "performance" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleListTagNodes", () => {
  it("returns every topic, module, and knowledge bit the repo found for that tag id", async () => {
    mockListNodesByTagId.mockResolvedValue({
      nodes: [node({ id: "top_1", kind: "topic" }), node({ id: "bit_1", kind: "bit" })],
      capped: false,
    });

    const res = fakeRes();
    await handleListTagNodes(res, "tag_perf_1");

    expect(mockListNodesByTagId).toHaveBeenCalledWith("tag_perf_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nodes: [node({ id: "top_1", kind: "topic" }), node({ id: "bit_1", kind: "bit" })],
      capped: false,
    });
  });

  it("passes through capped: true when the repo hit the cap", async () => {
    mockListNodesByTagId.mockResolvedValue({
      nodes: [node({ id: "top_1", kind: "topic" })],
      capped: true,
    });

    const res = fakeRes();
    await handleListTagNodes(res, "tag_perf_1");

    expect(res.status).toBe(200);
    expect((res.body as { capped: boolean }).capped).toBe(true);
  });

  it("returns an empty list, not an error, for a tag id with no assignments", async () => {
    mockListNodesByTagId.mockResolvedValue({ nodes: [], capped: false });

    const res = fakeRes();
    await handleListTagNodes(res, "tag_unknown");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nodes: [], capped: false });
  });
});

describe("handleSearch", () => {
  it("should label a nested subject hit with its parent path", async () => {
    vi.resetModules();
    vi.doMock("./search.repo.js", () => ({
      searchSubjects: async () => [{ id: "sub_common", name: "Common" }],
      searchCurricula: async () => [],
      searchTopics: async () => [],
      searchTopicsAndModulesRanked: async () => [],
    }));
    vi.doMock("./search-tag-and-bit.repo.js", () => ({
      searchByTagNameAcrossNodes: async () => [],
      searchKnowledgeBitsRanked: async () => [],
    }));
    vi.doMock("../subject/subject-path-labels.js", () => ({
      loadSubjectPathLabels: async () => new Map([["sub_common", "Business › Sales › Common"]]),
    }));

    const { handleSearch } = await import("./search.controller.js");
    const res = fakeRes();

    await handleSearch(res, "common");

    expect(res.body).toEqual({
      subjects: [{ id: "sub_common", label: "Business › Sales › Common" }],
      curricula: [],
      topics: [],
    });
  });
});
