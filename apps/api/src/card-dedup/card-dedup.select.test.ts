import { describe, expect, it } from "vitest";
import { classifySimilarity } from "./card-dedup.select.js";

describe("classifySimilarity", () => {
  it("should flag near-identical cards as duplicates without asking a model", () => {
    expect(classifySimilarity(0.97)).toBe("duplicate");
    expect(classifySimilarity(0.95)).toBe("duplicate");
  });

  it("should send only close calls to the model", () => {
    expect(classifySimilarity(0.9)).toBe("borderline");
    expect(classifySimilarity(0.85)).toBe("borderline");
  });

  it("should never let unrelated cards reach the model", () => {
    expect(classifySimilarity(0.6)).toBe("distinct");
  });
});
