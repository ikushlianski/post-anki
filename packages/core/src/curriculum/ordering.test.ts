import { describe, it, expect } from "vitest";
import { nextOrder, assignOrders, sortForDisplay, nextPriority } from "./ordering";

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

interface OrderedItem {
  id: string;
  order: number;
  priority: number;
}

function item(id: string, order: number, priority: number): OrderedItem {
  return { id, order, priority };
}

describe("sortForDisplay", () => {
  it("orders promoted topics above neutral topics, which are above demoted topics, when not strict", () => {
    const items = [
      item("neutral-1", 0, 0),
      item("promoted", 1, 1),
      item("demoted", 2, -1),
      item("neutral-2", 3, 0),
    ];

    const result = sortForDisplay(items, false);

    expect(result.map((i) => i.id)).toEqual([
      "promoted",
      "neutral-1",
      "neutral-2",
      "demoted",
    ]);
  });

  it("preserves the learner's manual arrangement within a priority tier, when not strict", () => {
    const items = [
      item("a", 0, 0),
      item("b", 1, 1),
      item("c", 2, -1),
      item("d", 3, 0),
    ];

    const result = sortForDisplay(items, false);

    expect(result.map((i) => i.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("ignores priority entirely and sorts by manual order only, when strict", () => {
    const items = [
      item("neutral", 0, 0),
      item("promoted", 1, 1),
      item("demoted", 2, -1),
    ];

    const result = sortForDisplay(items, true);

    expect(result.map((i) => i.id)).toEqual(["neutral", "promoted", "demoted"]);
  });

  it("degrades gracefully when every item shares the same priority — order-only within that tier", () => {
    const items = [item("b", 1, 1), item("a", 0, 1), item("c", 2, 1)];

    const result = sortForDisplay(items, false);

    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const items = [item("b", 1, 1), item("a", 0, 0)];

    sortForDisplay(items, false);

    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("nextPriority", () => {
  it("promotes a neutral topic to promoted on an up click", () => {
    expect(nextPriority(0, "up")).toBe(1);
  });

  it("moves a demoted topic directly to promoted on a single up click, not through neutral", () => {
    expect(nextPriority(-1, "up")).toBe(1);
  });

  it("un-promotes an already-promoted topic back to neutral on an up click (toggle, not accumulator)", () => {
    expect(nextPriority(1, "up")).toBe(0);
  });

  it("demotes a neutral topic to demoted on a down click", () => {
    expect(nextPriority(0, "down")).toBe(-1);
  });

  it("moves a promoted topic directly to demoted on a single down click, not through neutral", () => {
    expect(nextPriority(1, "down")).toBe(-1);
  });

  it("un-demotes an already-demoted topic back to neutral on a down click (toggle, not accumulator)", () => {
    expect(nextPriority(-1, "down")).toBe(0);
  });
});
