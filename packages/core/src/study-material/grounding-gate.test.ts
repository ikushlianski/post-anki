import { describe, expect, it } from "vitest";
import { capGroundingText, hasUsableGroundingText, MAX_GROUNDING_CHARS, MIN_GROUNDING_CHARS } from "./grounding-gate.js";

describe("hasUsableGroundingText", () => {
  it("is false for empty text", () => {
    expect(hasUsableGroundingText("")).toBe(false);
  });

  it("is false for text shorter than the default threshold", () => {
    expect(hasUsableGroundingText("a".repeat(MIN_GROUNDING_CHARS - 1))).toBe(false);
  });

  it("is true for text at or above the default threshold", () => {
    expect(hasUsableGroundingText("a".repeat(MIN_GROUNDING_CHARS))).toBe(true);
  });

  it("trims whitespace before measuring length", () => {
    const padded = `   ${"a".repeat(MIN_GROUNDING_CHARS - 1)}   `;

    expect(hasUsableGroundingText(padded)).toBe(false);
  });

  it("honours a custom minChars threshold", () => {
    expect(hasUsableGroundingText("short but enough", 5)).toBe(true);
    expect(hasUsableGroundingText("no", 5)).toBe(false);
  });
});

describe("capGroundingText", () => {
  it("returns text unchanged when under the default cap", () => {
    const text = "a".repeat(100);

    expect(capGroundingText(text)).toBe(text);
  });

  it("truncates text over the default cap", () => {
    const text = "a".repeat(MAX_GROUNDING_CHARS + 500);

    expect(capGroundingText(text)).toHaveLength(MAX_GROUNDING_CHARS);
  });

  it("honours a custom maxChars", () => {
    expect(capGroundingText("abcdefgh", 4)).toBe("abcd");
  });
});
