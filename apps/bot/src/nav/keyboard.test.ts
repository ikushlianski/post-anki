import { describe, it, expect } from "vitest";
import { chunkButtons } from "./keyboard.js";

describe("chunkButtons", () => {
  it("returns no rows for an empty list", () => {
    expect(chunkButtons([], 2)).toEqual([]);
  });

  it("splits an evenly divisible list", () => {
    expect(chunkButtons([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves a short final row for an uneven list", () => {
    expect(chunkButtons([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it("puts each item on its own row at perRow 1", () => {
    expect(chunkButtons(["a", "b"], 1)).toEqual([["a"], ["b"]]);
  });
});
