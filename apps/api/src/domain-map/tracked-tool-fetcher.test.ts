import { beforeEach, describe, expect, it, vi } from "vitest";

// SCENARIO 1 (.planning/doc-changelog-scan/scenarios.md) — pure hash/
// change-detection logic, no DB, no real network. fetchWithTimeout is
// mocked at the shared/outbound-fetch.js module boundary so this file never
// makes a real outbound call; loadEnv is mocked so each test can control
// E2E_MOCK_TRACKED_TOOL_CONTENT without process.env's parse-once cache.

const mockFetchWithTimeout = vi.fn();
const mockLoadEnv = vi.fn();

vi.mock("../shared/outbound-fetch.js", () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  truncateText: (text: string, maxChars: number) =>
    text.length > maxChars ? text.slice(0, maxChars) : text,
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: mockLoadEnv,
}));

const TOOL = { toolKey: "nextjs", label: "Next.js", sourceUrl: "https://example.invalid/feed" };

beforeEach(() => {
  mockFetchWithTimeout.mockReset();
  mockLoadEnv.mockReset();
  mockLoadEnv.mockReturnValue({});
});

describe("fetchTrackedTool — SCENARIO 1 (content hashing detects change and non-change identically each time)", () => {
  it("hashes identical content to the identical hash on repeated calls (deterministic)", async () => {
    mockFetchWithTimeout.mockResolvedValue("release notes v1.0.0");

    const { fetchTrackedTool } = await import("./tracked-tool-fetcher.js");

    const first = await fetchTrackedTool(TOOL);
    const second = await fetchTrackedTool(TOOL);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.hash).toBe(second?.hash);
    expect(first?.content).toBe(second?.content);
  });

  it("hashes content differing by even one character to a different hash", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce("release notes v1.0.0");
    const { fetchTrackedTool } = await import("./tracked-tool-fetcher.js");
    const first = await fetchTrackedTool(TOOL);

    mockFetchWithTimeout.mockResolvedValueOnce("release notes v1.0.1");
    const second = await fetchTrackedTool(TOOL);

    expect(first?.hash).not.toBe(second?.hash);
  });

  it("returns null (never throws) when the fetch fails — distinguishable from a matching hash", async () => {
    mockFetchWithTimeout.mockResolvedValue(null);

    const { fetchTrackedTool } = await import("./tracked-tool-fetcher.js");

    await expect(fetchTrackedTool(TOOL)).resolves.toBeNull();
  });

  it("when E2E_MOCK_TRACKED_TOOL_CONTENT is set for this tool_key, returns the fixed content and never calls fetchWithTimeout", async () => {
    mockLoadEnv.mockReturnValue({
      E2E_MOCK_TRACKED_TOOL_CONTENT: JSON.stringify({ nextjs: "mocked fixed content for nextjs" }),
    });

    const { fetchTrackedTool } = await import("./tracked-tool-fetcher.js");

    const result = await fetchTrackedTool(TOOL);

    expect(result).not.toBeNull();
    expect(result?.content).toBe("mocked fixed content for nextjs");
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("when mocking is active but this tool_key has no entry, returns null and STILL never calls fetchWithTimeout (never falls through to a real network call)", async () => {
    mockLoadEnv.mockReturnValue({
      E2E_MOCK_TRACKED_TOOL_CONTENT: JSON.stringify({ typescript: "mocked typescript content" }),
    });

    const { fetchTrackedTool } = await import("./tracked-tool-fetcher.js");

    const result = await fetchTrackedTool(TOOL);

    expect(result).toBeNull();
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
