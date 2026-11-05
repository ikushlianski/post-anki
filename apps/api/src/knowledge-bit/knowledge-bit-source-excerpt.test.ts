import { describe, expect, it } from "vitest";
import { excerptAroundBody } from "./knowledge-bit-source-excerpt.js";

describe("excerptAroundBody", () => {
  it("should keep the passage the card was cut from inside a long source", () => {
    const raw = `${"a ".repeat(5000)}THE BODY TEXT${" b".repeat(5000)}`;

    const excerpt = excerptAroundBody(raw, "THE BODY TEXT", 1000);

    expect(excerpt).toContain("THE BODY TEXT");
    expect(excerpt.length).toBeLessThanOrEqual(1000);
  });

  it("should fall back to the start of the source when the body is not found", () => {
    const raw = "start ".repeat(1000);

    const excerpt = excerptAroundBody(raw, "missing", 100);

    expect(excerpt.startsWith("start")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(100);
  });

  it("should return a short source whole and trimmed", () => {
    expect(excerptAroundBody("  short source  ", "short")).toBe("short source");
  });

  it("should return nothing when the source text is missing", () => {
    expect(excerptAroundBody(null, "body")).toBe("");
    expect(excerptAroundBody("   ", "body")).toBe("");
  });
});
