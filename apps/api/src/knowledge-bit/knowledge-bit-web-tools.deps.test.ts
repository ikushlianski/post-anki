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

  it("should normalize host case, trailing slash and fragment", () => {
    expect(normalizeUrlForComparison("https://A.com/x/#f")).toBe("https://a.com/x");
  });
});
