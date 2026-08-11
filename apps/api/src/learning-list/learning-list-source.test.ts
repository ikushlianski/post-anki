import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGuardedFetchText = vi.fn();

vi.mock("../shared/guarded-fetch.js", () => ({
  guardedFetchText: (...args: unknown[]) => mockGuardedFetchText(...args),
}));

import { resolveLearningListSource } from "./learning-list-source.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveLearningListSource", () => {
  describe("a video URL with no pasted description", () => {
    it("is rejected with a clear reason and never fetched", async () => {
      const result = await resolveLearningListSource({
        kind: "video",
        url: "https://www.youtube.com/watch?v=abc",
        pastedDescription: null,
      });

      expect(result).toEqual({
        ok: false,
        error: "video_requires_description",
        message: expect.stringContaining("description"),
      });
      expect(mockGuardedFetchText).not.toHaveBeenCalled();
    });

    it("treats a whitespace-only description as missing", async () => {
      const result = await resolveLearningListSource({
        kind: "video",
        url: "https://www.youtube.com/watch?v=abc",
        pastedDescription: "   \n  ",
      });

      expect(result.ok).toBe(false);
      expect(mockGuardedFetchText).not.toHaveBeenCalled();
    });
  });

  describe("a video URL with a pasted description", () => {
    it("uses the description as the source text without fetching the video page", async () => {
      const result = await resolveLearningListSource({
        kind: "video",
        url: "https://www.youtube.com/watch?v=abc",
        pastedDescription: "In this talk we cover React Server Components end to end.",
      });

      expect(result).toEqual({
        ok: true,
        text: "In this talk we cover React Server Components end to end.",
        finalUrl: null,
      });
      expect(mockGuardedFetchText).not.toHaveBeenCalled();
    });
  });

  describe("an article URL", () => {
    it("goes through the guarded fetcher and returns stripped text", async () => {
      mockGuardedFetchText.mockResolvedValue({
        ok: true,
        finalUrl: "https://example.com/post",
        status: 200,
        text: "<html><script>evil()</script><body><h1>Hello</h1><p>World</p></body></html>",
        truncated: false,
      });

      const result = await resolveLearningListSource({
        kind: "article",
        url: "https://example.com/post",
        pastedDescription: null,
      });

      expect(result).toEqual({
        ok: true,
        text: "Hello World",
        finalUrl: "https://example.com/post",
      });
      expect(mockGuardedFetchText).toHaveBeenCalledWith("https://example.com/post");
    });

    it("surfaces an SSRF-blocked URL as a blocked source, never as empty text", async () => {
      mockGuardedFetchText.mockResolvedValue({
        ok: false,
        outcome: "blocked",
        reason: "private_address",
        message: "resolves to a private address",
        blockedUrl: "http://169.254.169.254/latest/meta-data/",
      });

      const result = await resolveLearningListSource({
        kind: "article",
        url: "http://169.254.169.254/latest/meta-data/",
        pastedDescription: null,
      });

      expect(result).toEqual({
        ok: false,
        error: "source_blocked",
        message: "resolves to a private address",
      });
    });

    it("reports an HTTP failure as unreachable", async () => {
      mockGuardedFetchText.mockResolvedValue({ ok: false, outcome: "http_error", status: 404 });

      const result = await resolveLearningListSource({
        kind: "article",
        url: "https://example.com/missing",
        pastedDescription: null,
      });

      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toBe("source_unreachable");
    });

    it("reports a page with no readable text as empty rather than classifying nothing", async () => {
      mockGuardedFetchText.mockResolvedValue({
        ok: true,
        finalUrl: "https://example.com/blank",
        status: 200,
        text: "<html><body></body></html>",
        truncated: false,
      });

      const result = await resolveLearningListSource({
        kind: "article",
        url: "https://example.com/blank",
        pastedDescription: null,
      });

      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toBe("source_empty");
    });
  });
});
