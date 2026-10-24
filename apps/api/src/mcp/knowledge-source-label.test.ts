import { describe, expect, it } from "vitest";
import { buildSourceLabel, SOURCE_LABEL_MAX_LENGTH } from "./knowledge-source-label.js";

describe("buildSourceLabel", () => {
  it("should prefer the summary over the raw text when the summary is set", () => {
    expect(buildSourceLabel({ summary: "A short summary", rawText: "Long raw body" })).toBe("A short summary");
  });

  it("should fall back to the raw text when the summary is missing or blank", () => {
    expect(buildSourceLabel({ summary: null, rawText: "Raw body" })).toBe("Raw body");
    expect(buildSourceLabel({ summary: "  ", rawText: "Raw body" })).toBe("Raw body");
  });

  it("should collapse whitespace so a multi-line paste reads as one line", () => {
    expect(buildSourceLabel({ summary: null, rawText: "  first\n\nsecond   third " })).toBe("first second third");
  });

  it("should trim long text to about 120 characters with an ellipsis", () => {
    const label = buildSourceLabel({ summary: null, rawText: "a".repeat(500) });

    expect(label).toBe(`${"a".repeat(SOURCE_LABEL_MAX_LENGTH)}…`);
  });

  it("should return an empty label when the source has neither summary nor raw text", () => {
    expect(buildSourceLabel({ summary: null, rawText: null })).toBe("");
  });
});
