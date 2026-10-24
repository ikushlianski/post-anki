import { describe, expect, it } from "vitest";
import { deriveBrowserSourceLabel } from "./knowledge-bit-browser-source-label.js";

describe("deriveBrowserSourceLabel", () => {
  it("should name an article source by its site", () => {
    expect(
      deriveBrowserSourceLabel({ sourceUrl: "https://blog.example.com/post/1", rawText: "text" }),
    ).toBe("blog.example.com");
  });

  it("should name a pasted source by its first non-empty line", () => {
    expect(deriveBrowserSourceLabel({ sourceUrl: null, rawText: "\n  Kubernetes notes \nmore" })).toBe(
      "Kubernetes notes",
    );
  });

  it("should clip long labels to 80 characters", () => {
    const label = deriveBrowserSourceLabel({ sourceUrl: null, rawText: "x".repeat(200) });

    expect(label).toHaveLength(80);
  });

  it("should give no label when the source has neither link nor text", () => {
    expect(deriveBrowserSourceLabel({ sourceUrl: null, rawText: null })).toBeNull();
  });
});
