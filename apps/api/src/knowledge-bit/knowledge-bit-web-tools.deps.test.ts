import { beforeEach, describe, expect, it, vi } from "vitest";

const webSearch = vi.fn();
const fetchWithTimeout = vi.fn();

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

vi.mock("../shared/outbound-fetch.js", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
  truncateText: (text: string, max: number) => text.slice(0, max),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { createKnowledgeBitWebTools, normalizeUrlForComparison } = await import(
  "./knowledge-bit-web-tools.deps.js"
);
const { fetchPageFor } = await import("../mastra/knowledge-bit-chat-tools.js");

const options = { knowledgeBitId: "kb_1", searchOp: "op", searchPurpose: "Search" };

describe("knowledge bit web tools deps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webSearch.mockResolvedValue({
      ok: true,
      text: "web text",
      citations: ["https://Example.com/Guide/"],
    });
  });

  it("should treat a trailing-slash, fragment and host-case variant of a cited url as cited", async () => {
    const { deps } = createKnowledgeBitWebTools(options);

    await deps.searchWeb("q");

    expect(deps.isCitedUrl("https://example.com/Guide")).toBe(true);
    expect(deps.isCitedUrl("https://EXAMPLE.com/Guide/#intro")).toBe(true);
  });

  it("should reject a url that search never cited", async () => {
    const { deps } = createKnowledgeBitWebTools(options);

    await deps.searchWeb("q");

    expect(deps.isCitedUrl("https://example.com/other")).toBe(false);
    expect(deps.isCitedUrl("https://evil.example.org/Guide")).toBe(false);
  });

  it("should turn a thrown page fetch into a fetch_failed refusal instead of propagating", async () => {
    fetchWithTimeout.mockRejectedValue(new Error("socket hang up"));
    const { deps } = createKnowledgeBitWebTools(options);

    await deps.searchWeb("q");

    await expect(fetchPageFor({ url: "https://example.com/Guide" }, deps)).resolves.toEqual({
      ok: false,
      refusal: "fetch_failed",
    });
  });

  it("should report only safe cited urls as sources, keeping the original form", async () => {
    webSearch.mockResolvedValue({
      ok: true,
      text: "t",
      citations: ["https://example.com/a", "https://example.com/a/", "file:///etc/passwd"],
    });
    const { deps, getSources } = createKnowledgeBitWebTools(options);

    await deps.searchWeb("q");

    expect(getSources()).toEqual(["https://example.com/a"]);
  });

  it("should stop paying for searches after the cap and tell the model so", async () => {
    const { deps, getUsage } = createKnowledgeBitWebTools({ ...options, maxSearches: 2 });

    await deps.searchWeb("a");
    await deps.searchWeb("b");

    const third = await deps.searchWeb("c");

    expect(webSearch).toHaveBeenCalledTimes(2);
    expect(third).toEqual({
      text: "Search limit reached for this reply; answer with what you have.",
      citations: [],
    });
    expect(getUsage()).toEqual({ searches: 2, fetches: 0 });
  });

  it("should refuse a second page read without fetching", async () => {
    fetchWithTimeout.mockResolvedValue("<html><body>page</body></html>");
    const { deps, getUsage } = createKnowledgeBitWebTools({ ...options, maxPageFetches: 1 });

    await deps.fetchPage("https://example.com/a");

    expect(await deps.fetchPage("https://example.com/b")).toBeNull();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(getUsage().fetches).toBe(1);
  });

  it("should run searches on the forced tier", async () => {
    const { deps } = createKnowledgeBitWebTools({ ...options, forceTier: "cheap" });

    await deps.searchWeb("q");

    expect(webSearch.mock.calls[0]?.[4]).toBe("cheap");
  });

  it("should not pay again for an identical repeated query and not count it as a search", async () => {
    const { deps, getUsage } = createKnowledgeBitWebTools(options);

    await deps.searchWeb("Rust  lifetimes");

    const repeat = await deps.searchWeb("rust lifetimes ");

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(repeat.citations).toEqual([]);
    expect(getUsage().searches).toBe(1);
  });

  it("should cap the search text and the fetched page text at the configured sizes", async () => {
    webSearch.mockResolvedValue({ ok: true, text: "s".repeat(5000), citations: ["https://example.com/a"] });
    fetchWithTimeout.mockResolvedValue(`<html><body>${"p".repeat(9000)}</body></html>`);
    const { deps } = createKnowledgeBitWebTools({ ...options, maxPageChars: 6000 });

    const search = await deps.searchWeb("q");
    const page = await deps.fetchPage("https://example.com/a");

    expect(search.text).toHaveLength(4000);
    expect(page?.text.length).toBeLessThanOrEqual(6000);
  });

  it("should let the model fetch a seeded source url without a search citing it", async () => {
    fetchWithTimeout.mockResolvedValue("<html><body>source page</body></html>");
    const { deps } = createKnowledgeBitWebTools({ ...options, seedCitedUrls: ["https://blog.example.com/post"] });

    await expect(fetchPageFor({ url: "https://blog.example.com/post/" }, deps)).resolves.toMatchObject({ ok: true });
  });

  it("should still refuse a seeded url that is not safe to fetch", async () => {
    const { deps } = createKnowledgeBitWebTools({ ...options, seedCitedUrls: ["http://127.0.0.1/admin"] });

    await expect(fetchPageFor({ url: "http://127.0.0.1/admin" }, deps)).resolves.toEqual({
      ok: false,
      refusal: "unsafe_url",
    });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("should normalize host case, trailing slash and fragment", () => {
    expect(normalizeUrlForComparison("https://A.com/x/#f")).toBe("https://a.com/x");
  });
});
