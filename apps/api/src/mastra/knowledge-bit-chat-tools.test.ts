import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPageFor, searchWebFor, type KnowledgeBitChatToolsDeps } from "./knowledge-bit-chat-tools.js";

function makeDeps(overrides: Partial<KnowledgeBitChatToolsDeps> = {}): KnowledgeBitChatToolsDeps {
  return {
    searchWeb: vi.fn().mockResolvedValue({ text: "", citations: [] }),
    isCitedUrl: vi.fn().mockReturnValue(true),
    fetchPage: vi.fn().mockResolvedValue({ text: "page text" }),
    ...overrides,
  };
}

describe("searchWebFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cites a real, safe url and filters out an unsafe one", async () => {
    const deps = makeDeps({
      searchWeb: vi.fn().mockResolvedValue({
        text: "current guidance",
        citations: ["https://example.com/real-source", "javascript:alert(1)"],
      }),
    });

    const result = await searchWebFor({ query: "current TCP RFC" }, deps);

    expect(result).toEqual({
      ok: true,
      text: "current guidance",
      citations: ["https://example.com/real-source"],
    });
  });

  it("passes the caller's query straight through to the search dependency", async () => {
    const deps = makeDeps();

    await searchWebFor({ query: "recent RFC updates" }, deps);

    expect(deps.searchWeb).toHaveBeenCalledWith("recent RFC updates");
  });
});

describe("fetchPageFor", () => {
  it("refuses an unsafe url without fetching", async () => {
    const deps = makeDeps();

    const result = await fetchPageFor({ url: "http://127.0.0.1/admin" }, deps);

    expect(result).toEqual({ ok: false, refusal: "unsafe_url" });
    expect(deps.fetchPage).not.toHaveBeenCalled();
  });

  it("refuses a safe url that searchWeb never cited", async () => {
    const deps = makeDeps({ isCitedUrl: vi.fn().mockReturnValue(false) });

    const result = await fetchPageFor({ url: "https://example.com/other" }, deps);

    expect(result).toEqual({ ok: false, refusal: "not_cited_by_search" });
    expect(deps.fetchPage).not.toHaveBeenCalled();
  });

  it("returns the page text framed as untrusted for a cited safe url", async () => {
    const deps = makeDeps();

    const result = await fetchPageFor({ url: "https://example.com/real-source" }, deps);

    expect(result).toMatchObject({ ok: true, untrustedExternalContent: "page text" });
  });
});
