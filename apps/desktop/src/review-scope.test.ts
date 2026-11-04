import { describe, expect, it } from "vitest";
import { clampAheadDays, dueSummary, parseStoredAheadDays, scopeKey, subjectOptions } from "@/review-scope";

describe("scopeKey", () => {
  it("should give each subject and learn-ahead setting its own cache key", () => {
    expect(scopeKey({ subjectId: null, aheadDays: 0 })).toBe("all|0");
    expect(scopeKey({ subjectId: "s1", aheadDays: 0 })).toBe("s1|0");
    expect(scopeKey({ subjectId: "s1", aheadDays: 3 })).not.toBe(scopeKey({ subjectId: "s1", aheadDays: 0 }));
  });
});

describe("learn-ahead days", () => {
  it("should keep the stored value inside zero to thirty days", () => {
    expect(clampAheadDays(45)).toBe(30);
    expect(clampAheadDays(-2)).toBe(0);
    expect(clampAheadDays(NaN)).toBe(0);
  });

  it("should fall back to off when nothing is stored", () => {
    expect(parseStoredAheadDays(null)).toBe(0);
    expect(parseStoredAheadDays("7")).toBe(7);
  });
});

describe("subjectOptions", () => {
  it("should show each subject with its due and new counts when they are known", () => {
    const options = subjectOptions(
      [
        { id: "s1", name: "Biology", parentId: null },
        { id: "s2", name: "Chemistry", parentId: null },
      ],
      {
        subjects: [{ subjectId: "s1", dueCount: 3, newCount: 2 }],
        unsorted: { dueCount: 0, newCount: 0 },
        newRemainingToday: 5,
      },
    );

    expect(options).toEqual([
      { value: "s1", label: "Biology (3 due · 2 new)" },
      { value: "s2", label: "Chemistry" },
    ]);
  });
});

describe("dueSummary", () => {
  it("should say nothing is due when both counts are zero", () => {
    expect(dueSummary(0, 0)).toBe("nothing due");
  });
});
