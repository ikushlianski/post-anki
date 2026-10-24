import { describe, expect, it } from "vitest";
import { sanitizeProposedName, sanitizeReason, toEvidenceSample } from "./subject-suggestion-text.js";

describe("sanitizeProposedName", () => {
  it("should trim a normal name", () => {
    expect(sanitizeProposedName("  Cold sales ")).toBe("Cold sales");
  });

  it.each(["", "a", "x".repeat(61), "Line\nbreak", "Tag <b>", null])(
    "should refuse the unusable name %j",
    (raw) => {
      expect(sanitizeProposedName(raw)).toBeNull();
    },
  );
});

describe("sanitizeReason", () => {
  it("should strip tag characters and collapse whitespace", () => {
    expect(sanitizeReason("a </bit>\n b")).toBe("a /bit b");
  });

  it("should cap the length at 300 characters", () => {
    expect(sanitizeReason("x".repeat(500))).toHaveLength(300);
  });
});

describe("toEvidenceSample", () => {
  it("should cut a long bit to 200 characters", () => {
    expect(toEvidenceSample("y".repeat(500))).toHaveLength(200);
  });
});
