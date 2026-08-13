import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGuardedFetchText = vi.fn();

vi.mock("../shared/guarded-fetch.js", () => ({
  guardedFetchText: (...args: unknown[]) => mockGuardedFetchText(...args),
}));

import { discoverGithubChapters } from "./github-chapters.js";

const CHAPTER_URL =
  "https://github.com/Mathews-Tom/Agentic-Design-Patterns/blob/main/01-Part_One/Chapter_1-Prompt_Chaining-abc123.md";

function treeResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    finalUrl: "https://api.github.com/repos/Mathews-Tom/Agentic-Design-Patterns/git/trees/main?recursive=1",
    status: 200,
    truncated: false,
    text: JSON.stringify({
      truncated: false,
      tree: [
        { path: "README.md", type: "blob" },
        { path: "01-Part_One/Chapter_2-Routing-hash2.md", type: "blob" },
        { path: "01-Part_One/Chapter_1-Prompt_Chaining-abc123.md", type: "blob" },
        { path: "01-Part_One", type: "tree" },
        { path: "01-Part_One/cover.png", type: "blob" },
      ],
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("discoverGithubChapters", () => {
  it("discovers and orders sibling chapters from a realistic repository tree", async () => {
    mockGuardedFetchText.mockResolvedValue(treeResponse());

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(mockGuardedFetchText).toHaveBeenCalledWith(
      "https://api.github.com/repos/Mathews-Tom/Agentic-Design-Patterns/git/trees/main?recursive=1",
    );
    expect(result.truncated).toBe(false);
    expect(result.capped).toBe(false);
    expect(result.chapters.map((chapter) => chapter.path)).toEqual([
      "01-Part_One/Chapter_1-Prompt_Chaining-abc123.md",
      "01-Part_One/Chapter_2-Routing-hash2.md",
    ]);
    expect(result.chapters[0]!.title).toBe("Chapter 1 — Prompt Chaining");
  });

  it("reports a truncated tree as a partial result, not an error", async () => {
    mockGuardedFetchText.mockResolvedValue(treeResponse({ truncated: true }));

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result.truncated).toBe(true);
    expect(result.chapters.length).toBeGreaterThan(0);
  });

  it("degrades to no chapters discovered on a rate-limited 403", async () => {
    mockGuardedFetchText.mockResolvedValue({ ok: false, outcome: "http_error", status: 403 });

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("degrades to no chapters discovered on a 404", async () => {
    mockGuardedFetchText.mockResolvedValue({ ok: false, outcome: "http_error", status: 404 });

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("degrades to no chapters discovered on a network failure", async () => {
    mockGuardedFetchText.mockResolvedValue({ ok: false, outcome: "network_error" });

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("degrades to no chapters discovered on malformed JSON", async () => {
    mockGuardedFetchText.mockResolvedValue({
      ok: true,
      finalUrl: "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
      status: 200,
      truncated: false,
      text: "{not valid json",
    });

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("degrades to no chapters discovered when the response shape doesn't match the schema", async () => {
    mockGuardedFetchText.mockResolvedValue({
      ok: true,
      finalUrl: "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
      status: 200,
      truncated: false,
      text: JSON.stringify({ message: "Not Found" }),
    });

    const result = await discoverGithubChapters(CHAPTER_URL);

    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("ignores a non-GitHub URL entirely, without calling the fetcher", async () => {
    const result = await discoverGithubChapters("https://example.com/some/article");

    expect(mockGuardedFetchText).not.toHaveBeenCalled();
    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });

  it("ignores a GitHub URL that is not a blob URL, without calling the fetcher", async () => {
    const result = await discoverGithubChapters("https://github.com/owner/repo");

    expect(mockGuardedFetchText).not.toHaveBeenCalled();
    expect(result).toEqual({ chapters: [], truncated: false, capped: false });
  });
});
