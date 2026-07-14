import { describe, it, expect } from "vitest";
import { countPriorWrong } from "./socratic.map";

describe("countPriorWrong", () => {
  it("counts only wrong answers for the given concept", () => {
    const turns = [
      { gapId: "g1", degree: "mostly_wrong" },
      { gapId: "g1", degree: "slightly_wrong" },
      { gapId: "g1", degree: "correct" },
      { gapId: "g2", degree: "mostly_wrong" },
    ];

    expect(countPriorWrong(turns, "g1")).toBe(2);
  });

  it("ignores unanswered turns with a null degree", () => {
    const turns = [
      { gapId: "g1", degree: null },
      { gapId: "g1", degree: "slightly_wrong" },
    ];

    expect(countPriorWrong(turns, "g1")).toBe(1);
  });

  it("returns zero when the concept has no wrong history", () => {
    expect(countPriorWrong([{ gapId: "g1", degree: "correct" }], "g1")).toBe(0);
  });
});
