import { describe, it, expect } from "vitest";
import { nextOrder, assignOrders } from "./ordering";

describe("nextOrder", () => {
  it("returns 1 for an empty list", () => {
    expect(nextOrder([])).toBe(1);
  });

  it("appends after the current maximum", () => {
    expect(nextOrder([1, 2, 3])).toBe(4);
  });

  it("ignores gaps and uses the maximum, not the count", () => {
    expect(nextOrder([1, 2, 7])).toBe(8);
  });

  it("handles a single element", () => {
    expect(nextOrder([5])).toBe(6);
  });
});

describe("assignOrders", () => {
  it("assigns sequential 1-based orders in the given sequence", () => {
    expect(assignOrders(["c", "a", "b"])).toEqual([
      { id: "c", order: 1 },
      { id: "a", order: 2 },
      { id: "b", order: 3 },
    ]);
  });

  it("returns an empty list for no ids", () => {
    expect(assignOrders([])).toEqual([]);
  });
});
