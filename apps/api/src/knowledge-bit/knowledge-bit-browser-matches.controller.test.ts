import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";

vi.mock("./knowledge-bit-browser-matches.orchestrator.js", () => ({ searchKnowledgeBitBrowserMatches: vi.fn() }));

const { searchKnowledgeBitBrowserMatches } = await import("./knowledge-bit-browser-matches.orchestrator.js");
const { EmbeddingFailedError, SearchRateLimitedError } = await import("./knowledge-bit-browser-matches.errors.js");
const { handleKnowledgeBitBrowserMatches } = await import("./knowledge-bit-browser-matches.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    setHeader() {},
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("meaning search controller", () => {
  it("should hand the words and the same filters as the list to the search", async () => {
    vi.mocked(searchKnowledgeBitBrowserMatches).mockResolvedValue({
      items: [],
      capped: false,
      readyCount: 1,
      notReadyCount: 0,
    });
    const res = fakeRes();

    await handleKnowledgeBitBrowserMatches(res, "?q=%20heart%20&origins=notion,bogus&addedBy=ai");

    expect(res.status).toBe(200);
    expect(searchKnowledgeBitBrowserMatches).toHaveBeenCalledWith(
      expect.objectContaining({ q: "heart", origins: ["notion"], addedBy: ["ai"] }),
    );
  });

  it("should refuse empty or over-long words without searching", async () => {
    const empty = fakeRes();
    const long = fakeRes();

    await handleKnowledgeBitBrowserMatches(empty, "?q=%20%20");
    await handleKnowledgeBitBrowserMatches(long, `?q=${"a".repeat(301)}`);

    expect([empty.status, long.status]).toEqual([400, 400]);
    expect(searchKnowledgeBitBrowserMatches).not.toHaveBeenCalled();
  });

  it("should refuse a reversed date range without searching", async () => {
    const res = fakeRes();

    await handleKnowledgeBitBrowserMatches(res, "?q=heart&from=2026-05-02&to=2026-05-01");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_date_range" });
    expect(searchKnowledgeBitBrowserMatches).not.toHaveBeenCalled();
  });

  it("should answer 429 search_rate_limited when searches come too fast", async () => {
    vi.mocked(searchKnowledgeBitBrowserMatches).mockRejectedValue(new SearchRateLimitedError());
    const res = fakeRes();

    await handleKnowledgeBitBrowserMatches(res, "?q=heart");

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: "search_rate_limited" });
  });

  it("should answer 502 embedding_failed when the service fails", async () => {
    vi.mocked(searchKnowledgeBitBrowserMatches).mockRejectedValue(new EmbeddingFailedError(new Error("x")));
    const res = fakeRes();

    await handleKnowledgeBitBrowserMatches(res, "?q=heart");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "embedding_failed" });
  });

  it("should pass the spending limit error on to the server-wide 429 handler", async () => {
    vi.mocked(searchKnowledgeBitBrowserMatches).mockRejectedValue(new LlmBudgetExceededError(5, 5));

    await expect(handleKnowledgeBitBrowserMatches(fakeRes(), "?q=heart")).rejects.toBeInstanceOf(
      LlmBudgetExceededError,
    );
  });
});
