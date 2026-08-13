import { describe, expect, it } from "vitest";
import { findExactUrlDuplicates, normalizeSourceUrl } from "./normalize-url";

describe("normalizeSourceUrl", () => {
  it("lowercases the host", () => {
    expect(normalizeSourceUrl("https://Example.COM/article")).toBe("example.com/article");
  });

  it("strips a trailing slash", () => {
    expect(normalizeSourceUrl("https://example.com/article/")).toBe("example.com/article");
  });

  it("strips the query string", () => {
    expect(normalizeSourceUrl("https://example.com/article?utm_source=newsletter")).toBe(
      "example.com/article",
    );
  });

  it("strips the fragment", () => {
    expect(normalizeSourceUrl("https://example.com/article#section-2")).toBe(
      "example.com/article",
    );
  });

  it("treats http and https on the same host+path as the same normalized URL", () => {
    expect(normalizeSourceUrl("http://example.com/article")).toBe(
      normalizeSourceUrl("https://example.com/article"),
    );
  });

  it("returns null for an unparsable value", () => {
    expect(normalizeSourceUrl("not a url at all")).toBeNull();
  });

  it("does not collapse the root path's own single slash", () => {
    expect(normalizeSourceUrl("https://example.com/")).toBe("example.com/");
  });
});

describe("findExactUrlDuplicates", () => {
  it("pairs two sources sharing the same normalized URL", () => {
    const pairs = findExactUrlDuplicates([
      { id: "b", normalizedUrl: "example.com/article" },
      { id: "a", normalizedUrl: "example.com/article" },
    ]);

    expect(pairs).toEqual([
      { sourceAId: "a", sourceBId: "b", normalizedUrl: "example.com/article" },
    ]);
  });

  it("never matches two sources with genuinely different normalized URLs", () => {
    const pairs = findExactUrlDuplicates([
      { id: "a", normalizedUrl: "example.com/one" },
      { id: "b", normalizedUrl: "example.com/two" },
    ]);

    expect(pairs).toHaveLength(0);
  });

  it("never pairs two sources that both failed to normalize", () => {
    const pairs = findExactUrlDuplicates([
      { id: "a", normalizedUrl: null },
      { id: "b", normalizedUrl: null },
    ]);

    expect(pairs).toHaveLength(0);
  });

  it("groups three sources sharing one URL into three pairs, all canonically ordered", () => {
    const pairs = findExactUrlDuplicates([
      { id: "c", normalizedUrl: "example.com/article" },
      { id: "a", normalizedUrl: "example.com/article" },
      { id: "b", normalizedUrl: "example.com/article" },
    ]);

    expect(pairs).toHaveLength(3);
    for (const pair of pairs) {
      expect(pair.sourceAId < pair.sourceBId).toBe(true);
    }
  });
});
