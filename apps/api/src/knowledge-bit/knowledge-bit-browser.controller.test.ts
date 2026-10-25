import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listKnowledgeBitBrowser = vi.fn();
const countKnowledgeBitBrowserSubjects = vi.fn();

vi.mock("./knowledge-bit-browser.repo.js", () => ({
  listKnowledgeBitBrowser: (...args: unknown[]) => listKnowledgeBitBrowser(...args),
  countKnowledgeBitBrowserSubjects: () => countKnowledgeBitBrowserSubjects(),
}));

const { handleListKnowledgeBitBrowser, handleCountKnowledgeBitBrowserSubjects } = await import(
  "./knowledge-bit-browser.controller.js"
);

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

describe("knowledge browser controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass the subject and page size to the repo", async () => {
    listKnowledgeBitBrowser.mockResolvedValue({ items: [], hasMore: false });

    const res = fakeRes();

    await handleListKnowledgeBitBrowser(res, "?subjectId=s1&limit=10");

    expect(listKnowledgeBitBrowser).toHaveBeenCalledWith({ subjectId: "s1", limit: 10, offset: 0 });
    expect(res.status).toBe(200);
  });

  it("should pass clean filters on and ignore unknown values", async () => {
    listKnowledgeBitBrowser.mockResolvedValue({ items: [], hasMore: false, total: 0 });

    const res = fakeRes();

    await handleListKnowledgeBitBrowser(res, "?origins=article,bogus&states=nope&site=https://www.Example.com/a");

    expect(listKnowledgeBitBrowser).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      origins: ["article"],
      site: "example.com",
      link: "has",
    });
    expect(res.status).toBe(200);
  });

  it("should refuse a date range that ends before it starts without reading anything", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitBrowser(res, "?from=2026-03-02&to=2026-03-01");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_date_range" });
    expect(listKnowledgeBitBrowser).not.toHaveBeenCalled();
  });

  it("should reject a page size above 100 without reading anything", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitBrowser(res, "?limit=500");

    expect(res.status).toBe(400);
    expect(listKnowledgeBitBrowser).not.toHaveBeenCalled();
  });

  it("should return the per-subject counts", async () => {
    countKnowledgeBitBrowserSubjects.mockResolvedValue([{ subjectId: "s1", count: 3 }]);

    const res = fakeRes();

    await handleCountKnowledgeBitBrowserSubjects(res);

    expect(res.body).toEqual([{ subjectId: "s1", count: 3 }]);
  });
});
