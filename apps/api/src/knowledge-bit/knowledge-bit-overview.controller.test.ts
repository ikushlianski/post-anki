import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listKnowledgeBitOverview = vi.fn();

vi.mock("./knowledge-bit-overview.repo.js", () => ({
  listKnowledgeBitOverview: (...args: unknown[]) => listKnowledgeBitOverview(...args),
}));

const { handleListKnowledgeBitOverview } = await import("./knowledge-bit-overview.controller.js");

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

describe("handleListKnowledgeBitOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass the subject filter and search text through to the repo", async () => {
    listKnowledgeBitOverview.mockResolvedValue({ items: [], hasMore: false });

    const res = fakeRes();

    await handleListKnowledgeBitOverview(res, "?subjectId=s1&q=nginx&limit=10");

    expect(listKnowledgeBitOverview).toHaveBeenCalledWith(
      { subjectId: "s1", q: "nginx", limit: 10, offset: 0 },
      expect.any(Date),
    );
    expect(res.status).toBe(200);
  });

  it("should reject an oversized page without touching the repo", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitOverview(res, "?limit=5000");

    expect(res.status).toBe(400);
    expect(listKnowledgeBitOverview).not.toHaveBeenCalled();
  });
});
