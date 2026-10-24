import { describe, expect, it } from "vitest";
import { buildDedupeKey, normalizeSubjectName } from "./subject-suggestion.keys.js";

describe("normalizeSubjectName", () => {
  it("should treat differently cased and punctuated spellings of one name as the same", () => {
    expect(normalizeSubjectName("  Cold   Sales! ")).toBe("cold sales");
    expect(normalizeSubjectName("cold-sales")).toBe("coldsales");
  });
});

describe("buildDedupeKey", () => {
  it("should give the same key to a re-suggested name under the same parent", () => {
    expect(buildDedupeKey("sub-subject", "sub_1", "Cold Sales")).toBe(
      buildDedupeKey("sub-subject", "sub_1", " cold  sales."),
    );
  });

  it("should keep the same name under different parents or kinds distinct", () => {
    const base = buildDedupeKey("sub-subject", "sub_1", "Pricing");

    expect(buildDedupeKey("sub-subject", "sub_2", "Pricing")).not.toBe(base);
    expect(buildDedupeKey("new-subject", null, "Pricing")).not.toBe(base);
  });
});
