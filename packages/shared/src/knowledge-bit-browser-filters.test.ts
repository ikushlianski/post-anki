import { describe, expect, it } from "vitest";
import {
  isBrowserDateRangeReversed,
  normalizeBrowserSite,
  parseKnowledgeBitBrowserFilters,
} from "./knowledge-bit-browser-filters";

describe("normalizeBrowserSite", () => {
  it("should reduce a pasted address to the bare site name", () => {
    expect(normalizeBrowserSite("https://www.Wikipedia.org/wiki/Cat?x=1")).toBe("wikipedia.org");
  });

  it("should keep a subdomain so the owner can narrow to it", () => {
    expect(normalizeBrowserSite("en.wikipedia.org")).toBe("en.wikipedia.org");
  });

  it("should drop ports and credentials from a typed address", () => {
    expect(normalizeBrowserSite("http://me@example.com:8080/a")).toBe("example.com");
  });

  it("should treat text that is not a site as no site", () => {
    expect(normalizeBrowserSite("not a site!")).toBeNull();
    expect(normalizeBrowserSite("   ")).toBeNull();
  });
});

describe("parseKnowledgeBitBrowserFilters", () => {
  it("should return an empty filter set when nothing is asked", () => {
    expect(parseKnowledgeBitBrowserFilters({})).toEqual({});
  });

  it("should keep known source types and drop unknown ones one by one", () => {
    expect(parseKnowledgeBitBrowserFilters({ origins: "article,bogus,notion" })).toEqual({
      origins: ["notion", "article"],
    });
  });

  it("should ignore a filter whose values are all unknown", () => {
    expect(parseKnowledgeBitBrowserFilters({ states: "nope", addedBy: "robot", link: "maybe" })).toEqual({});
  });

  it("should read study states from a comma list", () => {
    expect(parseKnowledgeBitBrowserFilters({ states: "suspended,new" })).toEqual({
      states: ["new", "suspended"],
    });
  });

  it("should imply has-a-link when a site is typed", () => {
    expect(parseKnowledgeBitBrowserFilters({ site: "https://www.example.com/x", link: "none" })).toEqual({
      site: "example.com",
      link: "has",
    });
  });

  it("should trim text filters and cut them at 200 characters", () => {
    const parsed = parseKnowledgeBitBrowserFilters({ question: `  ${"a".repeat(300)}  `, answer: "   " });

    expect(parsed.question).toHaveLength(200);
    expect(parsed.answer).toBeUndefined();
  });

  it("should accept calendar days and instants and drop broken dates", () => {
    expect(
      parseKnowledgeBitBrowserFilters({ from: "2026-01-05", to: "2026-02-30T99" }),
    ).toEqual({ from: "2026-01-05" });
    expect(parseKnowledgeBitBrowserFilters({ to: "2026-02-01T21:59:59.999Z" })).toEqual({
      to: "2026-02-01T21:59:59.999Z",
    });
  });
});

describe("isBrowserDateRangeReversed", () => {
  it("should flag a from day later than the to day", () => {
    expect(isBrowserDateRangeReversed({ from: "2026-03-02", to: "2026-03-01" })).toBe(true);
  });

  it("should accept the same day as from and to", () => {
    expect(isBrowserDateRangeReversed({ from: "2026-03-01", to: "2026-03-01" })).toBe(false);
  });

  it("should accept an open-ended range", () => {
    expect(isBrowserDateRangeReversed({ from: "2026-03-01" })).toBe(false);
  });
});
