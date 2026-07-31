import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./cosine-similarity";

describe("cosineSimilarity", () => {
  it("scores two identical vectors as 1.0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 10);
  });

  it("scores two orthogonal vectors as 0.0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 10);
  });

  it("scores two opposite-direction vectors as -1.0", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0, 10);
  });

  it("scores near-duplicate vectors close to 1.0", () => {
    expect(cosineSimilarity([1, 1, 1], [1, 1, 1.01])).toBeGreaterThan(0.99);
  });

  it("throws on mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });

  it("returns 0 for a zero vector rather than NaN", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});
