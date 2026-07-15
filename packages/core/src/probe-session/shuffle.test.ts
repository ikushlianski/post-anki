import { describe, it, expect } from "vitest";
import { reindexOptions, reindexParallelArray } from "./shuffle";

describe("reindexOptions", () => {
  it("reorders options according to the permutation", () => {
    const result = reindexOptions(["a", "b", "c"], [2, 0, 1], [0]);

    expect(result.options).toEqual(["c", "a", "b"]);
  });

  it("remaps a single correct index so it still points at the original correct option", () => {
    const options = ["a", "b", "c"];
    const permutation = [2, 0, 1];
    const result = reindexOptions(options, permutation, [0]);

    expect(result.options[result.correctIndexes[0]!]).toBe(options[0]);
  });

  it("remaps every correct index in a multi-select set, preserving the original options", () => {
    const options = ["a", "b", "c", "d"];
    const permutation = [3, 1, 2, 0];
    const result = reindexOptions(options, permutation, [0, 2]);

    const remapped = result.correctIndexes.map((i) => result.options[i]);
    expect(remapped.sort()).toEqual(["a", "c"]);
  });

  it("returns an identical order and correct indexes for the identity permutation", () => {
    const result = reindexOptions(["a", "b"], [0, 1], [1]);

    expect(result.options).toEqual(["a", "b"]);
    expect(result.correctIndexes).toEqual([1]);
  });

  it("sorts the remapped correct indexes ascending", () => {
    const options = ["a", "b", "c"];
    const permutation = [1, 2, 0];
    const result = reindexOptions(options, permutation, [1, 2]);

    expect(result.correctIndexes).toEqual([...result.correctIndexes].sort((a, b) => a - b));
  });
});

describe("reindexParallelArray", () => {
  it("reorders a parallel array by the same permutation used for options, keeping each entry with its option", () => {
    const explanations = ["why a", "why b", "why c"];
    const permutation = [2, 0, 1];

    expect(reindexParallelArray(explanations, permutation)).toEqual([
      "why c",
      "why a",
      "why b",
    ]);
  });

  it("returns an identical order for the identity permutation", () => {
    const explanations = ["why a", "why b"];

    expect(reindexParallelArray(explanations, [0, 1])).toEqual(explanations);
  });

  it("works for arrays of objects, not just strings", () => {
    const explanations = [{ text: "why a" }, { text: "why b" }];
    const permutation = [1, 0];

    expect(reindexParallelArray(explanations, permutation)).toEqual([
      { text: "why b" },
      { text: "why a" },
    ]);
  });
});
