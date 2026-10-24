import { describe, expect, it } from "vitest";
import { hostOf, normalizeSourceUrl } from "./knowledge-source-duplicate.js";

describe("normalizeSourceUrl", () => {
  it("should treat the same article as one link whatever the host case, fragment or trailing slash", () => {
    const base = normalizeSourceUrl("https://example.com/post");

    expect(normalizeSourceUrl("https://EXAMPLE.com/post/")).toBe(base);
    expect(normalizeSourceUrl("https://example.com/post#section-2")).toBe(base);
  });

  it("should keep different articles and different queries apart", () => {
    expect(normalizeSourceUrl("https://example.com/a")).not.toBe(normalizeSourceUrl("https://example.com/b"));
    expect(normalizeSourceUrl("https://example.com/p?id=1")).not.toBe(normalizeSourceUrl("https://example.com/p?id=2"));
  });

  it("should give nothing for text that is not a link", () => {
    expect(normalizeSourceUrl("not a url")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf("https://Example.com/x")).toBe("example.com");
  });
});
