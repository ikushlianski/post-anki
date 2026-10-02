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
    tags: ["performance"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleListTagNodes", () => {
  it("returns every topic, module, and knowledge bit the repo found for that tag id", async () => {
    mockListNodesByTagId.mockResolvedValue([
      node({ id: "top_1", kind: "topic" }),
      node({ id: "bit_1", kind: "bit" }),
    ]);

    const res = fakeRes();
    await handleListTagNodes(res, "tag_perf_1");

    expect(mockListNodesByTagId).toHaveBeenCalledWith("tag_perf_1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns an empty list, not an error, for a tag id with no assignments", async () => {
    mockListNodesByTagId.mockResolvedValue([]);

    const res = fakeRes();
    await handleListTagNodes(res, "tag_unknown");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
