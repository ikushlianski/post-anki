import { describe, expect, it } from "vitest";
import { knowledgeBitBrowserMatchesQuerySchema } from "./knowledge-bit-browser-matches";

describe("meaning search request", () => {
  it("should trim the words and read the same lenient filters as the list", () => {
    const parsed = knowledgeBitBrowserMatchesQuerySchema.parse({ q: "  heart  ", origins: "notion,bogus", site: "www.Wikipedia.org" });

    expect(parsed).toMatchObject({ q: "heart", origins: ["notion"], site: "wikipedia.org" });
  });

  it("should refuse missing, blank and over-300-character words", () => {
    for (const q of [undefined, "   ", "a".repeat(301)]) {
      expect(knowledgeBitBrowserMatchesQuerySchema.safeParse({ q }).success).toBe(false);
    }
  });

  it("should accept exactly 300 characters", () => {
    expect(knowledgeBitBrowserMatchesQuerySchema.safeParse({ q: "a".repeat(300) }).success).toBe(true);
  });
});
