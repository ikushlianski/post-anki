import { describe, expect, it } from "vitest";
import { DUPLICATE_SIMILARITY_THRESHOLD, findDuplicatePairs } from "./find-duplicate-pairs";

describe("findDuplicatePairs", () => {
  it("returns a pair whose cosine similarity is above the threshold", () => {
    const pairs = findDuplicatePairs([
      { id: "sub_b", embedding: [1, 0, 0] },
      { id: "sub_a", embedding: [0.999, 0.001, 0] },
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.similarity).toBeGreaterThanOrEqual(DUPLICATE_SIMILARITY_THRESHOLD);
  });

  it("excludes a pair whose cosine similarity is below the threshold", () => {
    const pairs = findDuplicatePairs([
      { id: "sub_a", embedding: [1, 0, 0] },
      { id: "sub_b", embedding: [0, 1, 0] },
    ]);

    expect(pairs).toHaveLength(0);
  });

  it("returns subjectAId/subjectBId in canonical lexicographic order regardless of input order", () => {
    const pairs = findDuplicatePairs([
      { id: "sub_zzz", embedding: [1, 0] },
      { id: "sub_aaa", embedding: [1, 0] },
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ subjectAId: "sub_aaa", subjectBId: "sub_zzz" });
  });

  it("compares every pair, not just adjacent ones", () => {
    const pairs = findDuplicatePairs([
      { id: "sub_a", embedding: [1, 0, 0] },
      { id: "sub_b", embedding: [0, 1, 0] },
      { id: "sub_c", embedding: [1, 0.001, 0] },
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ subjectAId: "sub_a", subjectBId: "sub_c" });
  });

  it("returns an empty array for zero or one subject", () => {
    expect(findDuplicatePairs([])).toEqual([]);
    expect(findDuplicatePairs([{ id: "sub_a", embedding: [1, 0, 0] }])).toEqual([]);
  });

  it("accepts a custom threshold override", () => {
    const pairs = findDuplicatePairs(
      [
        { id: "sub_a", embedding: [1, 0] },
        { id: "sub_b", embedding: [0.9, 0.1] },
      ],
      0.5,
    );

    expect(pairs).toHaveLength(1);
  });
});
