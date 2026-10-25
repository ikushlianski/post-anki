import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";

vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("../shared/env.js", () => ({ loadEnv: vi.fn() }));
vi.mock("./knowledge-bit-browser-matches.repo.js", () => ({
  countBrowserMatchesScope: vi.fn(),
  rankBrowserMatchesInTransaction: vi.fn(),
}));

const { embedTexts } = await import("../shared/embeddings-client.js");
const { loadEnv } = await import("../shared/env.js");
const { countBrowserMatchesScope, rankBrowserMatchesInTransaction } = await import(
  "./knowledge-bit-browser-matches.repo.js"
);
const { EmbeddingFailedError, SearchRateLimitedError } = await import("./knowledge-bit-browser-matches.errors.js");
const { resetBrowserMatchesGuards, searchKnowledgeBitBrowserMatches } = await import(
  "./knowledge-bit-browser-matches.orchestrator.js"
);

function setModel(model: string): void {
  vi.mocked(loadEnv).mockReturnValue({ EMBEDDING_MODEL: model } as ReturnType<typeof loadEnv>);
}

beforeEach(() => {
  vi.resetAllMocks();
  resetBrowserMatchesGuards();
  setModel("model-a");
  vi.mocked(countBrowserMatchesScope).mockResolvedValue({ readyCount: 5, notReadyCount: 2 });
  vi.mocked(rankBrowserMatchesInTransaction).mockResolvedValue({ items: [], capped: false });
  vi.mocked(embedTexts).mockResolvedValue([{ id: "query", embedding: [0.1, 0.2] }]);
});

describe("meaning search orchestrator", () => {
  it("should pay for one embedding and report ranked results with the not-ready count", async () => {
    const answer = await searchKnowledgeBitBrowserMatches({ q: "heart" });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts).toHaveBeenCalledWith([{ id: "query", text: "heart" }]);
    expect(answer).toEqual({ items: [], capped: false, readyCount: 5, notReadyCount: 2 });
  });

  it("should make no paid call when no piece in the filters is ready", async () => {
    vi.mocked(countBrowserMatchesScope).mockResolvedValue({ readyCount: 0, notReadyCount: 4 });

    const answer = await searchKnowledgeBitBrowserMatches({ q: "heart" });

    expect(embedTexts).not.toHaveBeenCalled();
    expect(rankBrowserMatchesInTransaction).not.toHaveBeenCalled();
    expect(answer).toEqual({ items: [], capped: false, readyCount: 0, notReadyCount: 4 });
  });

  it("should not pay again when the same words are searched again under another filter", async () => {
    await searchKnowledgeBitBrowserMatches({ q: "Heart  pump" });
    await searchKnowledgeBitBrowserMatches({ q: "heart pump", origins: ["notion"] });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(rankBrowserMatchesInTransaction).toHaveBeenCalledTimes(2);
  });

  it("should pay again when the embedding model setting changed", async () => {
    await searchKnowledgeBitBrowserMatches({ q: "heart" });
    setModel("model-b");
    await searchKnowledgeBitBrowserMatches({ q: "heart" });

    expect(embedTexts).toHaveBeenCalledTimes(2);
  });

  it("should refuse the 21st new search in a minute before paying", async () => {
    for (let i = 0; i < 20; i += 1) {
      await searchKnowledgeBitBrowserMatches({ q: `words ${i}` });
    }

    await expect(searchKnowledgeBitBrowserMatches({ q: "one more" })).rejects.toBeInstanceOf(
      SearchRateLimitedError,
    );
    expect(embedTexts).toHaveBeenCalledTimes(20);
  });

  it("should still answer a repeated search when the rate limit is used up", async () => {
    await searchKnowledgeBitBrowserMatches({ q: "repeat me" });

    for (let i = 0; i < 19; i += 1) {
      await searchKnowledgeBitBrowserMatches({ q: `words ${i}` });
    }

    await expect(searchKnowledgeBitBrowserMatches({ q: "repeat me" })).resolves.toBeDefined();
  });

  it("should let the spending limit refusal through unchanged", async () => {
    vi.mocked(embedTexts).mockRejectedValue(new LlmBudgetExceededError(5, 5));

    await expect(searchKnowledgeBitBrowserMatches({ q: "heart" })).rejects.toBeInstanceOf(
      LlmBudgetExceededError,
    );
  });

  it("should report a service failure as an embedding failure and not cache it", async () => {
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error("boom"));

    await expect(searchKnowledgeBitBrowserMatches({ q: "heart" })).rejects.toBeInstanceOf(EmbeddingFailedError);
    await searchKnowledgeBitBrowserMatches({ q: "heart" });

    expect(embedTexts).toHaveBeenCalledTimes(2);
  });
});
