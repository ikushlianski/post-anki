import { describe, expect, it } from "vitest";
import { pendingReviewSubjectCountsResponse, subjectPathLabel } from "./knowledge-bit-pending-subjects";

const tree = new Map([
  ["a", { name: "Languages", parentId: null }],
  ["b", { name: "German", parentId: "a" }],
  ["loop1", { name: "X", parentId: "loop2" }],
  ["loop2", { name: "Y", parentId: "loop1" }],
]);

describe("subjectPathLabel", () => {
  it("should show a sub-subject under its parent so the learner can tell same-named subjects apart", () => {
    expect(subjectPathLabel("b", tree)).toBe("Languages / German");
  });

  it("should stop at a parent cycle instead of looping forever", () => {
    expect(subjectPathLabel("loop1", tree)).toBe("Y / X");
  });
});

describe("pendingReviewSubjectCountsResponse", () => {
  it("should reject a subject row with no pending cards", () => {
    expect(
      pendingReviewSubjectCountsResponse.safeParse([{ subjectId: "a", name: "A", path: "A", pendingCount: 0 }]).success,
    ).toBe(false);
  });
});
