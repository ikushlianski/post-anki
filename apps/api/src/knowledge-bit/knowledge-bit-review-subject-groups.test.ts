import { describe, expect, it } from "vitest";
import { groupReviewCardsBySubject } from "./knowledge-bit-review-subject-groups.js";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";

function card(variantId: string, subjectId: string | null): KnowledgeBitReviewCardRow {
  return { variantId, subjectId } as KnowledgeBitReviewCardRow;
}

const labels = new Map([
  ["s1", "Business › Sales"],
  ["s2", "Swift"],
]);

describe("groupReviewCardsBySubject", () => {
  it("should put cards of one subject together while keeping due order inside each group", () => {
    const result = groupReviewCardsBySubject(
      [card("a", "s1"), card("b", "s2"), card("c", "s1"), card("d", "s2")],
      labels,
    );

    expect(result.map((row) => row.variantId)).toEqual(["a", "c", "b", "d"]);
  });

  it("should label each card with its full subject path", () => {
    const result = groupReviewCardsBySubject([card("a", "s1"), card("b", null)], labels);

    expect(result.map((row) => row.subjectPath)).toEqual(["Business › Sales", null]);
  });
});
